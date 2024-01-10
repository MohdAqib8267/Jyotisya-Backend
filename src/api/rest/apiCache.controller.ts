import { Request, Response } from "express";
import prisma from "../../data";
import {
  RequestHeaders,
  ExternalAPIRequestDetails,
  ExternalAPIResponseBody,
  ExternalAPIResponseMetadata,
  BirthDetails,
} from "../../types";
import { sendErrorResponse } from "../../utils/http";
import crypto from "crypto";
import { Prisma } from "@prisma/client";
import axios from "axios";
import qs from "qs";
import moment from "moment";
import { getSignedS3Url, uploadToS3 } from "../../utils/aws/client";
import { KUNDLI_BUCKET } from "../../constants";

const nestedSortJson = (json: any) => {
  if (typeof json !== "object") {
    return json;
  }

  const keys = Object.keys(json);
  keys.sort();

  const sortedJson: any = {};
  for (const key of keys) {
    sortedJson[key] = nestedSortJson(json[key]);
  }
  return sortedJson;
};

export const generateExternalAPICacheKey = (
  api_request_details: ExternalAPIRequestDetails
) => {
  const hash = crypto.createHash("sha256");
  if (api_request_details) {
    hash.update(JSON.stringify(nestedSortJson(api_request_details)));
  }
  return hash.digest("hex");
};

const processResponse = async (
  api_id: number,
  data: any,
  cache_key: string
) => {
  if (api_id === 1) {
    if (data) {
      if (data.svg) {
        // Check if svg is a valid svg
        const svg = data.svg;
        const svgRegex = /<svg.*?>.*?<\/svg>/g;
        const match = svg.match(svgRegex);

        if (match) {
          // Valid SVG, Put this on S3
          const signedSvgUrl = await uploadToS3(
            "kundli/" + cache_key + ".svg",
            KUNDLI_BUCKET,
            svg
          );

          const unsignedFileUrl = signedSvgUrl?.split("?")[0];
          data.svgUrl = unsignedFileUrl;
          delete data.svg;
        }
      } else if (data.svgUrl) {
        const svgUrl = data.svgUrl;
        // Check if svgUrl is a valid S3 url
        const s3Regex = /.*?s3.ap-south-1.amazonaws.com\/kundli\/.*?\.svg/g;

        const s3Match = svgUrl.match(s3Regex);

        if (s3Match) {
          const signedSvgUrl = await getSignedS3Url({
            s3Url: svgUrl,
          });
          const fetchedSvg = await axios.get(signedSvgUrl);
          data.svg = fetchedSvg.data;
          delete data.svgUrl;
        }
      }
    }
  }

  return data;
};

export const externalApiCacheHandler = async (req: Request, res: Response) => {
  const api_id = parseInt(req.params.api_id);
  let user_id: number = 0;
  const api_request_details = req.body as ExternalAPIRequestDetails;

  try {
    const api_metadata = await prisma.external_api_metadata.findUnique({
      where: {
        api_id,
      },
    });

    if (!api_metadata) {
      return sendErrorResponse(res, 404, "API not found");
    }

    if (api_request_details.expansionParams) {
      if (api_id === 1 && api_request_details.expansionParams.user_uuid) {
        const user = await prisma.user.findUnique({
          where: {
            user_uuid: api_request_details.expansionParams.user_uuid,
          },
        });

        if (!user) {
          return sendErrorResponse(res, 404, "User not found");
        }
        user_id = user.user_id;

        const birth_details = user.birth_details as BirthDetails | null;

        if (!birth_details || !birth_details.agent_input) {
          return sendErrorResponse(res, 400, "Birth details not found");
        }

        const birth_date = moment(birth_details.agent_input.date, "DD-MM-YYYY");
        const birth_time = moment(birth_details.agent_input.time, "HH:mm A");

        api_request_details.payload = {
          ...api_request_details.payload,
          day: birth_date.date(),
          month: birth_date.month() + 1,
          year: birth_date.year(),
          hour: birth_time.hour(),
          min: birth_time.minute(),
          lat: birth_details.agent_input.geo.latitude,
          lon: birth_details.agent_input.geo.longitude,
          tzone: (
            birth_details.agent_input.geo.utc_offset_minutes / 60
          ).toFixed(1),
        };
      }
    }

    const cacheKey = generateExternalAPICacheKey(api_request_details);
    const cachedResponse = await prisma.external_api_response_cache.findFirst({
      where: {
        api_id,
        cache_key: cacheKey,
        expires_at: {
          gte: new Date(),
        },
      },
      orderBy: {
        api_id: "desc",
      },
    });

    let response_metadata: ExternalAPIResponseMetadata | undefined = undefined;
    let response_body: ExternalAPIResponseBody | undefined = undefined;

    if (cachedResponse) {
      response_metadata =
        cachedResponse.response_metadata as ExternalAPIResponseMetadata;
      response_body = cachedResponse.response_body as ExternalAPIResponseBody;
    } else {
      const start_time = Date.now();

      const common_headers = api_metadata.common_headers as RequestHeaders;

      const shouldStringifyPayload =
        common_headers &&
        common_headers["content-type"] === "application/x-www-form-urlencoded";

      const response = await axios.request({
        method: api_request_details.method,
        url: `${api_metadata.base_url}${api_request_details.path}`,
        params: api_request_details.queryParams,
        data: shouldStringifyPayload
          ? qs.stringify(api_request_details.payload)
          : api_request_details.payload,
        headers: api_metadata.common_headers as RequestHeaders,
      });

      const end_time = Date.now();

      if (response.status < 200 || response.status >= 300) {
        return sendErrorResponse(
          res,
          response.status,
          JSON.stringify(response.data)
        );
      }

      response_metadata = {
        status_code: response.status,
        response_time: end_time - start_time,
        headers: {
          content_type: response.headers["content-type"],
        },
      };

      response_body = {
        data: await processResponse(api_id, response.data, cacheKey),
      };

      await prisma.external_api_response_cache.create({
        data: {
          api_id,
          user_id,
          cache_key: cacheKey,
          request_metadata: api_request_details,
          response_metadata: response_metadata,
          response_body: response_body,
          expires_at: new Date(Date.now() + api_metadata.ttl * 1000),
        },
      });
    }

    return res.json({
      success: true,
      data: {
        content_type: response_metadata.headers.content_type,
        body: await processResponse(api_id, response_body.data, cacheKey),
      },
    });
  } catch (error) {
    console.error(error);
    return sendErrorResponse(res);
  }
};
