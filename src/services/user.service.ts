import fs from "fs";
import {
  agent,
  agent_booking,
  agent_live_status,
  AGENT_ROLE,
  BOOKING_STATUS,
  Prisma,
  user,
} from "@prisma/client";
import moment from "moment";
import { getActiveAstro } from "../scripts/googleapis/getAgents/astro";
import { BirthDetails, MessagePayload, UserServiceParams } from "../types";
import { BaseService } from "./base.service";
import prisma from "../data/index";
import { agentService, orderService } from "./services.factory";
import { makePreBookingCall } from "../libs/knowlarity";
import { getSignedS3Url, uploadToS3 } from "../utils/aws/client";
import axios from "axios";
import { scriptRunner } from "../utils/common/bash.runner";
import {
  APPEND_FILE_PATH,
  KUNDLI_ROOT_DIR,
  NUMBER_OF_KUNDLI_PAGES_IN_SAMPLE,
} from "../constants";
import { promisify } from "node:util";
import { _buildError } from "../utils/error";
import { checkAndMakeDirectory, pipeline } from "../utils/common/fileHandler";
import path from "path";
import stream from "stream";

export default class UserService extends BaseService {
  constructor(params: UserServiceParams) {
    super(params);
  }
  private async _getJyotish(timeStamp: string) {
    const active_astro = await getActiveAstro(timeStamp);
    return await this.getAvailableAgents(active_astro);
  }

  public setStickyAgent = async (
    user_id: number,
    agent_id: number,
    agent_role: AGENT_ROLE
  ) => {
    const existingMapping = await prisma.user_agent_mapping.findFirst({
      where: {
        user_id,
        agent_role,
        is_active: true,
      },
    });

    if (existingMapping) {
      if (existingMapping.agent_id === agent_id) {
        return existingMapping;
      }

      await prisma.user_agent_mapping.update({
        where: {
          mapping_id: existingMapping.mapping_id,
        },
        data: {
          is_active: false,
        },
      });
    }

    const newMapping = await prisma.user_agent_mapping.create({
      data: {
        user_id,
        agent_id,
        agent_role,
      },
    });

    return newMapping;
  };

  public getStickyAgent = async (user_id: number, agent_role: AGENT_ROLE) => {
    const existingMapping = await prisma.user_agent_mapping.findFirst({
      where: {
        user_id,
        agent_role,
        is_active: true,
      },
    });

    return existingMapping;
  };

  // public checkStickyAgent =async (user_id:number, agent_id:number) => {
  //   const existingMapping = await prisma.user_agent_mapping.findFirst({
  //     where:{
  //       user_id,
  //       agent_id
  //     },
  //   });
  //   return existingMapping;
  // }
  async updateStickyAgent(mapping_id: number, astro_id: number) {
    try {
      const updatedAgent = await prisma.user_agent_mapping.update({
        where: { mapping_id: mapping_id },
        data: { agent_id: astro_id },
      });
  
      return updatedAgent;
    } catch (error) {
      console.log(error);
      return null;
    }
  }

  public findUserByUUID = async (user_uuid: string) => {
    const user = await prisma.user.findUnique({
      where: {
        user_uuid,
      },
    });

    return user;
  };

  getPhoneNumberByUserId = async (user_id: number) => {
    const user = await prisma.user.findFirst({
      where: {
        user_id,
      },
    });

    if (!user) {
      return null;
    }

    return user.phone_number;
  };

  public forwardRequest = async (data: any) => {
    let stage = "pre-process";
    const user_name: string = data?.fields?.name;
    const phone_number: string = data?.fields?.phone
      .replaceAll(" ", "")
      .replace("+", "");
    const dob: string = data?.fields?.["Date of Birth"];
    const cob: string = data?.fields?.["City of Birth"];
    const sob: string = data?.fields?.["State of Birth"];
    const tob: string = data?.fields?.["Time of Birth"];

    const hand_image: string[] = data?.fields?.hand_image || [];
    const calling_number: string[] = data?.fields?.["Alternate Phone"]
      ? [data?.fields?.["Alternate Phone"]]
      : [];

    const birth_details: BirthDetails = {
      raw: {
        date: dob && ["{{dob}}", "@DOB"].includes(dob) === false ? dob : "",
        time: tob && ["{{tob}}", "@TOB"].includes(tob) === false ? tob : "",
        city: cob && ["{{cob}}", "@COB"].includes(cob) === false ? cob : "",
        state: sob && ["{{sob}}", "@SOB"].includes(sob) === false ? sob : "",
        country: "India",
      },
    };

    if (!data.fields) {
      return {
        status: 400,
        message: "missing fields",
        stage,
      };
    }

    let user_id: number;

    stage = "DB_UPDATE";
    try {
      const user = await this.findOrCreateUser(
        phone_number,
        user_name,
        birth_details
      );
      user_id = user.user_id;
    } catch (err: any) {
      return { stage, status: 500, message: err?.message };
    }

    const resp = await orderService.fulfillPendingBookings(user_id);

    if (resp) {
      return {
        stage,
        status: 200,
        message: data,
      };
    } else {
      return {
        stage,
        status: 500,
        message: data,
      };
    }
  };

  public forwardRequestFromQueue(payload: MessagePayload) {
    return this.#_forwardRequest(payload);
  }

  public forwardRequestFromQueueWithStaticDead(
    payload: MessagePayload,
    type?: string
  ) {
    return this.#_forwardRequest(payload);
  }

  #_forwardRequest = async (payload: MessagePayload) => {
    let stage = "";
    stage = "GET_ASTRO";

    this._logger.info({
      info: "forwardRequest",
      data: payload,
      stage: stage,
    });

    const data = payload.data;

    const booking_uuid = data.booking_uuid;
    if (booking_uuid.length > 0) {
      const booking = await prisma.agent_booking.findUnique({
        where: {
          booking_uuid,
        },
      });

      if (!booking) {
        this._logger.info({
          stage: "Fetching booking id",
          info: booking_uuid,
        });
        return {
          status: 400,
          message: "Booking not found",
          stage,
        };
      }

      if (booking.booking_status !== BOOKING_STATUS.AWAITING_CALL) {
        this._logger.info({
          stage: "Fetching booking id",
          info: booking_uuid,
          data: {
            booking_status: BOOKING_STATUS.AWAITING_CALL,
          },
        });
        return {
          status: 400,
          message: "Booking already processed",
          stage,
        };
      }

      const booking_id = booking.booking_id;
      const is_sticky_agent = booking.is_sticky_agent;
      let is_call_placed = false;
      let call_retry_count = data.metadata.call_retry_count;
      let available_agent: agent | agent_live_status | null;

      if (!is_sticky_agent) {
        const batch_phone_calls = await prisma.phone_call.findMany({
          where: {
            batch_uuid: data.metadata.batch_uuid,
          },
        });

        const exclude_agent_ids = batch_phone_calls.map(
          (call) => call.agent_id
        );

        available_agent = await agentService.getOneAgentAvailableRightNow(
          booking.booking_duration_mins + 5,
          exclude_agent_ids
        );
      } else {
        available_agent = await agentService.getOneAgentAvailableRightNow(
          booking.booking_duration_mins + 5,
          [],
          booking.astro_id
        );

        if (booking.astro_id === 1) {
          available_agent = await agentService.getAgentLiveStatusById(
            booking.astro_id,
            true
          );
        }
      }
      this._logger.info({
        stage: "Fetching agent id",
        info: booking_uuid,
        data: {
          booking_status: BOOKING_STATUS.AWAITING_CALL,
          available_agent,
        },
      });

      if (!available_agent) {
        // Reschedule call after 5 mins
        await orderService.rescheduleBooking(booking_id);
        return;
      }

      // Update Agent on call status as soon as possible
      const agent_id = available_agent.agent_id;

      const call_details = await makePreBookingCall(
        booking,
        agent_id,
        data.metadata.batch_uuid,
        call_retry_count
      );
      is_call_placed = call_details.is_call_placed;

      if (call_details.is_call_placed) {
        console.log(
          "Booking ID:",
          booking_id,
          ", Call Placed Successfully: ",
          call_details.call_id
        );
      } else {
        console.error(
          "Booking ID:",
          booking_id,
          ", Call Error:",
          call_details.message
        );
      }
    }
  };

  findUserById = async (user_id: number) => {
    return await prisma.user.findUnique({
      where: {
        user_id,
      },
    });
  };

  

  findUserByPhone = async (phone_number: string) => {
    return await prisma.user.findUnique({
      where: {
        phone_number,
       
      },
    });
  };

  

  updateUser = async (user_id: number, data: Prisma.userUpdateInput) => {
    return await prisma.user.update({
      where: {
        user_id,
      },
      data: {
        ...data,
      },
    });
  };

  findOrCreateUser = async (
    phone_number: string,
    user_name: string = "",
    birth_details: BirthDetails | null = null
  ) => {
    phone_number = phone_number
      .replaceAll(" ", "")
      .replaceAll("-", "")
      .replaceAll("+", "");
    if (phone_number.charAt(0) === "0") {
      phone_number = phone_number.substring(1);
    }

    if (phone_number.length === 10) {
      phone_number = `91${phone_number}`;
    }

    const existingUser = await prisma.user.findUnique({
      where: {
        phone_number,
      },
    });

    if (existingUser) {
      const updatedFields: Prisma.userUpdateInput = {};

      if (birth_details && !existingUser.birth_details) {
        updatedFields.birth_details = birth_details;
      }

      if (
        user_name &&
        user_name.length > 0 &&
        (!existingUser.user_name ||
          (existingUser.user_name && existingUser.user_name === ""))
      ) {
        updatedFields.user_name = user_name;
      }

      if (Object.keys(updatedFields).length > 0) {
        return await prisma.user.update({
          where: {
            user_id: existingUser.user_id,
          },
          data: updatedFields,
        });
      }

      return existingUser;
    }

    return await prisma.user.create({
      data: {
        phone_number,
        user_name,
        birth_details: birth_details
          ? (birth_details as unknown as Prisma.JsonObject)
          : Prisma.DbNull,
      },
    });
  };

  hasBirthDetails = async (
    user_id: number,
    check_agent_input: boolean = false
  ) => {
    const user = await prisma.user.findUnique({
      where: {
        user_id,
      },
    });

    if (!user) {
      return false;
    }

    const birth_details = user.birth_details as BirthDetails | null;

    if (!birth_details) {
      return false;
    }

    return true;
  };

  generateKundli = async (user_id: number) => {
    const user = await this.findUserById(user_id);

    if (!user) {
      this._logger.error({
        stage: "KUNDLI_REPORT_GEN",
        error: "User not found",
        data: {
          user_id,
        },
      });

      throw _buildError(this._logger, "KUNDLI_REPORT_GEN", "User not found", {
        user_id,
      });
    }

    const user_kundali = await prisma.user_kundli.findUnique({
      where: {
        user_id,
      },
    });

    if (user_kundali?.kundli_pdf_url) {
      return user_kundali.kundli_pdf_url;
    }

    const birth_details = user.birth_details as BirthDetails | null;

    if (!birth_details || !birth_details.agent_input) {
      this._logger.error({
        stage: "KUNDLI_REPORT_GEN",
        error: "Birth details not found",
        data: {
          user_id,
        },
      });

      throw _buildError(
        this._logger,
        "KUNDLI_REPORT_GEN",
        "Birth details not found",
        {
          user_id,
        }
      );
    }

    const city =
      birth_details?.agent_input?.geo?.city || birth_details.raw?.city;
    const dob = birth_details?.agent_input?.date || birth_details.raw?.date;
    const dob_time =
      birth_details?.agent_input?.time || birth_details.raw?.time;
    const country =
      birth_details?.agent_input.geo?.country || birth_details.raw?.country;

    const payload = {
      city,
      country,
      dob,
      dob_time,
      first_name: user?.user_name?.split(" ")[0],
      gender: birth_details.agent_input.gender === "female" ? "F" : "M",
      last_name: user?.user_name?.split(" ").length > 1 ?
              user?.user_name?.split(" ")[user?.user_name?.split(" ").length - 1] : "",
      report_language: "Hindi",
      report_type: "Report_LIFESIGN_TYPE_Super_Horoscope",
    };
    const validation_resp = Object.keys(payload).reduce(
      (resp: boolean, key: string) => {
        if (!payload[key as keyof typeof payload]) {
          return false;
        }
        return true;
      },
      true
    );
    if (!validation_resp) {
      throw _buildError(
        this._logger,
        "KUNDLI_REPORT_GEN",
        "invalid payload",
        payload
      );
    }
    const resp = await this.jyotisyaLambdaApi.generateKundli(payload);
    const s3_file_url = resp.data.s3_file_url.split("?")[0];
    await prisma.user_kundli.upsert({
      where: {
        user_id,
      },
      create: {
        user_id,
        kundli_pdf_url: s3_file_url,
      },
      update: {
        kundli_pdf_url: s3_file_url,
      },
    });
    return s3_file_url;
  };

  generateSampleKundli = async (user_uuid: string, kundli_s3_url?: string) => {
    const user = await this.findUserByUUID(user_uuid);

    if (!user) {
      throw _buildError(this._logger, "KUNDLI_REPORT_GEN", "user is invalid", {
        user_uuid,
      });
    }

    if (!kundli_s3_url) {
      kundli_s3_url = await this.generateKundli(user.user_id);
    }
    const signed_kundli_s3_url = await getSignedS3Url({ s3Url: kundli_s3_url });
    await checkAndMakeDirectory(`${KUNDLI_ROOT_DIR}/resources`);
    const input_file_path = `${KUNDLI_ROOT_DIR}/resources/${user_uuid}.pdf`;
    const temp_file_path = `${KUNDLI_ROOT_DIR}/resources/${user_uuid}-temp.pdf`;
    const out_file_path = `${KUNDLI_ROOT_DIR}/resources/${user_uuid}-sample-kundli.pdf`;
    const input_file_writer = fs.createWriteStream(input_file_path);

    const fileStream = (
      await axios.get(signed_kundli_s3_url, { responseType: "stream" })
    ).data;
    await pipeline(fileStream, input_file_writer);
    // await fileStream.pipe(input_file_writer);
    input_file_writer.close();

    await scriptRunner(path.resolve("./src/scripts/bash/pdf.sh"), [
      NUMBER_OF_KUNDLI_PAGES_IN_SAMPLE.toString(),
      input_file_path,
      APPEND_FILE_PATH,
      temp_file_path,
      out_file_path,
    ]);
    const out_file_path_read_stream = fs.createReadStream(out_file_path);
    const sample_s3_url = await uploadToS3(
      `sample/${user_uuid}-sample-kundli.pdf`,
      "jyotisya-kundli",
      out_file_path_read_stream
    );
    const s3_sample_file_url = sample_s3_url?.split("?")[0];

    if (!s3_sample_file_url) {
      throw _buildError(
        this._logger,
        "KUNDLI_REPORT_GEN",
        "invalid s3_file_url",
        {
          user_uuid,
        }
      );
    }
    await prisma.user_kundli.upsert({
      where: {
        user_id: user.user_id,
      },
      create: {
        user_id: user.user_id,
        sample_kundli_pdf_url: s3_sample_file_url,
      },
      update: {
        sample_kundli_pdf_url: s3_sample_file_url,
      },
    });
    fs.unlinkSync(input_file_path);
    fs.unlinkSync(temp_file_path);
    return {
      out_file_path,
      out_file_path_read_stream,
      sample_s3_url,
    };
  };

  updateExplorers = async () => {
    const users = (await prisma.$queryRaw`
      select
        user_id,
        is_aspirer,
        is_explorer,
        is_payer,
        pending_payments,
        payments
      from
        (
          select
            u.user_id as user_id,
            u.is_aspirer as is_aspirer,
            u.is_explorer as is_explorer,
            u.is_payer as is_payer,
            coalesce(b.p, 0) as payments,
            coalesce(c.q, 0) as pending_payments
          from
            user u
            left join (
              Select
                user_id as u,
                count(payment_status) as p
              from
                payment_link
              where
                payment_status = 'PAID'
              group by
                user_id
            ) as b on u.user_id = b.u
            left join (
              Select
                user_id as u,
                count(payment_status) as q
              from
                payment_link
              where
                payment_status = 'PENDING'
              group by
                user_id
            ) as c on u.user_id = c.u
          where
            date(u.created_at) between curdate() - interval 48 hour
            and curdate() - interval 20 hour
        ) as t
      where
        payments < '1'
        and pending_payments > 0
    `) as user[];
    for (const userObj of users) {
      if (userObj.is_explorer) {
        continue;
      }
      await prisma.$queryRaw`
          UPDATE
            user
          SET
            is_explorer = ${true}
          WHERE
            user_id = ${userObj.user_id}
        `;
    }
  };

  updateAspirers = async () => {
    const users = (await prisma.$queryRaw`
      select
        user_id,
        is_aspirer,
        is_explorer,
        is_payer
      from
        (
          select
            u.user_id as user_id,
            u.is_aspirer as is_aspirer,
            u.is_explorer as is_explorer,
            u.is_payer as is_payer,
            b.p as payments
          from
            user u
            left join (
              Select
                user_id as u,
                count(payment_status) as p
              from
                payment_link
              where
                payment_status = 'PAID'
              group by
                user_id
            ) as b on u.user_id = b.u
            left join agent_booking ab on u.user_id = ab.user_id
          where
            date(u.created_at) between curdate() - interval 72 hour
            and curdate() - interval 48 hour
            and ab.booking_status in (
              'AWAITING_USER_FEEDBACK_ASTRO',
              'AWAITING_USER_FEEDBACK_RM',
              'COMPLETED'
            )
        ) as t
      where
        payments = '1';
    `) as user[];
    for (const userObj of users) {
      // const userObj = await this.userRepo.findOneById("user_id", booking.user_id);
      if (userObj.is_payer) {
        continue;
      }
      if (userObj.is_aspirer) {
        continue;
      }
      await prisma.$queryRaw`
        UPDATE
          user
        SET
          is_aspirer = ${true}
        WHERE
          user_id = ${userObj.user_id}
      `;
    }
  };

  updatePayers = async () => {
    const bookings = (await prisma.$queryRaw`
       select
        *
      from
        agent_booking
      WHERE
        sku_id <> 1
        and booking_status IN (
          'AWAITING_USER_FEEDBACK_ASTRO',
          'AWAITING_USER_FEEDBACK_RM',
          'COMPLETED'
        )
        AND (created_at) > curdate() - interval 6 hour
    `) as agent_booking[];
    for (const bookingObj of bookings) {
      const userObj = await this.userRepo.findOneById(
        "user_id",
        bookingObj.user_id
      );
      if (userObj.is_payer) {
        continue;
      }
      await prisma.$queryRaw`
      UPDATE
        user
      SET
        is_payer = ${true}
      WHERE
        user_uuid = ${userObj.user_uuid}
    `;
    }
  };

  getKundaliChart = async (uuid: string, chart_type: string) => {
    const user = await this.userRepo.findOneById("user_uuid", uuid);
    const user_kundli_images: any = await this.userKundliRepo.findOneById(
      "user_uuid",
      uuid
    );
    if (!user_kundli_images) {
      try {
        await this.userKundliRepo.create({ user_uuid: uuid });
      } catch (err) {
        throw err;
      }
    }
    if (user_kundli_images && user_kundli_images[chart_type]) {
      return getSignedS3Url({
        s3Url: user_kundli_images[chart_type] as string,
      });
    }
    const {
      agent_input: {
        geo: { latitude, longitude },
        date,
        time,
      },
    } = user.birth_details as any;
    const momentDate = moment(date + " " + time, "YYYY-MM-DD HH:mm A");
    const data = {
      day: momentDate.day(),
      month: momentDate.month(),
      year: momentDate.year(),
      hour: momentDate.hour(),
      min: momentDate.minute(),
      lat: latitude.toFixed(2),
      lon: longitude.toFixed(2),
      tzone: 5.5,
    };
    const svg_img = await this.astrologApi.getChartSvg(data, chart_type);
    const url = await uploadToS3(
      `${uuid}/${chart_type}.svg`,
      "jyotisya-kundli",
      svg_img.svg
    );
    const base_url = url?.split("?")?.[0];
    try {
      await this.userKundliRepo.update(
        { [`${chart_type}`]: base_url },
        "user_uuid",
        uuid
      );
    } catch (err) {
      throw err;
    }
    return url;
  };
}
