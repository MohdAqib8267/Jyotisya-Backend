import { parseUrl } from "@aws-sdk/url-parser";

import { _buildError } from "../error";
import Logger from "../log";
import { log } from "console";
import {
  GetObjectCommand,
  PutObjectCommand,
  PutObjectRequest,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const DEFAULT_REGION = "ap-south-1";
const logger = new Logger("AWS CLIENT");

let s3Client: S3Client;

const getS3 = () => new S3Client({ region: DEFAULT_REGION });
const s3ObjectUrl = (bucket: string, key: string, region?: string) =>
  parseUrl(
    `https://${bucket}.s3.${region || DEFAULT_REGION}.amazonaws.com/${key}`
  );

export const uploadToS3 = async (
  Key: string,
  Bucket: string,
  Body: PutObjectRequest["Body"] | string | Uint8Array | Buffer
) => {
  const command = new PutObjectCommand({
    Bucket,
    Key,
    Body,
  });

  try {
    if (!s3Client) s3Client = getS3();
    const response = await s3Client.send(command);
    return await getSignedS3Url({
      s3Url: `https://${Bucket}.s3.ap-south-1.amazonaws.com/${Key}`,
    });
  } catch (err) {
    console.error(err);
  }
};

// main()

export const getBucketAndKeyName = (url: string) => {
  const s3Url = new URL(url);
  const bucketName = url.includes(".s3.ap-south-1.amazonaws.com")
    ? s3Url.hostname.split(".s3.ap-south-1.amazonaws.com")[0]
    : s3Url.hostname.split(".s3.amazonaws.com")[0];
  const key = s3Url.pathname.replace(/^\/|\/$/g, "");
  return {
    s3Url,
    bucketName,
    key,
  };
};

export const getSignedS3Url = async (args: {
  s3Url?: string;
  bucketName?: string;
  key?: string;
  expiryTime?: number;
}) => {
  let { s3Url, bucketName, key, expiryTime } = args;
  if (!s3Url && !(bucketName && key)) {
    throw _buildError(
      logger,
      "SIGNING S3 URL",
      `${{ s3Url }}, ${{ bucketName }}, ${{ key }}`,
      {}
    );
  }
  const time = expiryTime || 60 * 60;
  if (s3Url) {
    ({ bucketName, key } = getBucketAndKeyName(s3Url));
  }
  const params = {
    Bucket: bucketName,
    Key: key,
    Expires: time,
  };

  const command = new GetObjectCommand(params);
  if (!s3Client) s3Client = getS3();
  let signedUrl = await getSignedUrl(s3Client, command, { expiresIn: time });
  return signedUrl;
};
