import fs, { createReadStream } from "fs";
import axios from "axios";
import moment from "moment";
import prisma from "../data";
import FormData from "form-data";
import { ReadStream } from "node:fs";
import { BaseService } from "./base.service";
import { REMINDER_TYPE, WatiServiceParams } from "../types";
import { orderService, userService } from "./services.factory";
import { WatiClient } from "../client/wati.client";
import { _buildError } from "../utils/error";
import { BOOKING_STATUS, crm_reminder, user } from "@prisma/client";
import { getSignedS3Url } from "../utils/aws/client";
import { WatiSessionSendFileParamType } from "../client/types";
import appConfig from "../config";
import {
  ALLOWED_PHONE_NUMBER,
  KUNDLI_ROOT_DIR,
  KUNDLI_SKU_ID,
} from "../constants";
import { pipeline, waitForStreamToEnd } from "../utils/common/fileHandler";

export class WatiService extends BaseService {
  private watiClient: WatiClient;
  constructor(params: WatiServiceParams) {
    super(params);
    this.watiClient = params.watiClient;
  }

  /**
   * To-Dos
   * session done
   * sample kundli
   * 12 hrs feedback
   */
  messageTypeSelector = (data: any) => {
    if (data?.info?.startswith("Invalid Contact")) {
      return "INVALID_CONTACT";
    }
    if (data.ticketStatus === "CLOSED") {
      return "CLOSED";
    }
    if (data.result) {
      return data.result;
    }
    throw new Error();
  };

  openSessionForFileSharing = async (phone_number: string) => {
    const data = {
      template_name: "daily_horoscope_english",
      broadcast_name: "daily_horoscope_english",
      parameters: [],
    };
    const resp = await this.watiClient.sendTemplateMessage(data, phone_number);
    return resp.result;
  };

  async validateToSendSampleKundali(input: crm_reminder | null) {
    if (!input) return true;

    let resp = false;

    const user = await userService.findUserById(input.user_id);

    if (!user) {
      return resp;
    }

    const booking = await prisma.agent_booking.findMany({
      where: {
        user_id: user.user_id,
        booking_status: {
          in: [
            BOOKING_STATUS.AWAITING_USER_FEEDBACK_RM,
            BOOKING_STATUS.AWAITING_USER_FEEDBACK_ASTRO,
            BOOKING_STATUS.CANCELLED,
          ],
        },
        created_at: {
          gte: moment().subtract(4, "days").toDate(),
        },
      },
    });
    if (!booking.length) {
      return resp;
    }

    if (Object.keys(input.kundli_reminder || {}).length >= 3) {
      return resp;
    }

    const epoch_list = Object.keys(input.kundli_reminder || {}).map((e) => parseInt(e));

    if (epoch_list.length === 0 ||
      moment().valueOf() -
      Math.max(
        ...Object.keys(input.kundli_reminder || {}).map((e) => parseInt(e))
      )
      > 12 * 60 * 60 * 1000
    ) {
      resp = true;
    }
    return resp;
  }

  validateToSendUpSellReminder(input: crm_reminder | null) {
    if (!input) return true;
    if (Object.keys(input.upsell_reminder || {})) {
    }
  }

  validateToSendFeedbackReminder(input: crm_reminder | null) {
    if (!input) return true;
    if (Object.keys(input.feedback_reminder || {})) {
    }
  }

  setEligibiltiyForKundliReminder = async () => {
    const users_list = await prisma.$queryRaw`
      Select
        distinct ab.user_id,
        min(feedback_response.created_at) as first_successful_feedback
      from
        feedback_response
        left join agent_booking ab on feedback_response.booking_id = ab.booking_id
        left join user_kundli uk on ab.user_id = uk.user_id
      where
        parent_option_id not in (202, 213)
        and COALESCE(uk.kundli_upsell_eligible, ${false}) = ${false} 
      Group by
        ab.booking_id
      having
        first_successful_feedback between now() - interval 24 hour
        and now() - interval 6 hour
    ` as any[];
    for (const user of users_list) {
      const user_id = user.user_id;
      await prisma.user_kundli.upsert({
        where: {
          user_id: user_id,
        },
        create: {
          user_id,
          kundli_upsell_eligible: true,
        },
        update: {
          kundli_upsell_eligible: true,
        }
      });
    }
    this._logger.info({
      stage: "SETTING_KUNDLI_UPSELL_ELIGIBILITY",
      info: "done",
    });
  }

  kundliReminder = async () => {
    await this.setEligibiltiyForKundliReminder();
    const users = await prisma.user_kundli.findMany({
      where: {
        kundli_pdf_buy_status: false,
        kundli_upsell_eligible: true,
      },
    });

    for (const user of users) {
      const user_id = user.user_id;
      const crm_reminder = await prisma.crm_reminder.findFirst({
        where: {
          user_id: user_id,
        },
      });
      const resp = await this.validateToSendSampleKundali(crm_reminder);
      if (resp) {
        this._logger.info({
          stage: "SENDING_SAMPLE_KUNDALI",
          info: `sending...!!! checks passed`,
          data: { user_id: user_id },
        });
        try {
          await this.sendSampleKundli(user_id);
        } catch (err: any) {
          this._logger.error({
            stage: "SENDING_SAMPLE_KUNDALI",
            error: err,
            data: { user_id: user_id },
          });
        }
      }
      else {
        this._logger.info({
          stage: "SENDING_SAMPLE_KUNDALI",
          info: `not sending...!!! checks failed`,
          data: { user_id: user_id },
        });
      }
    }
  };

  sendSampleKundliOnBroadCast = async (
    name: string,
    phone_number: string,
    s3Url: string | undefined,
    slug: string
  ) => {
    if (!s3Url) {
      throw _buildError(
        this._logger,
        "brodasting message to session closed user",
        "missing s3 url",
        { phone_number }
      );
    }
    const data = {
      template_name: "sample_kundli",
      broadcast_name: "sample_kundli",
      parameters: [
        {
          name: "name",
          value: name,
        },

        {
          name: "kundli_URL",
          value: await getSignedS3Url({ s3Url }),
        },
        {
          name: "payment_link_slug",
          value: slug,
        },
      ],
    };

    const resp = await this.watiClient.sendTemplateMessage(data, phone_number);
    if (resp.result === true) {
      this._logger.info({
        info: `Send sample kundli broadcast successfully to : ${phone_number}`,
        stage: "BRODCAST_SAMPLE_KUNDLI_REMINDER",
      });
    } else {
      this._logger.error({
        stage: "BRODCAST_SAMPLE_KUNDLI_REMINDER",
        error: "FAILURE IN SENDING BROADCASE",
        data: {
          phone_number,
        },
      });
    }
    return resp;
  };
  sendSampleKundli = async (user_id: number) => {
    const user = await userService.findUserById(user_id);
    if (!user) {
      return;
    }
    const user_kundali_obj = await this.userKundliRepo.findOneById(
      "user_id",
      user_id,
      {
        kundli_pdf_url: true,
        sample_kundli_pdf_url: true,
        kundli_pdf_buy_status: true,
      }
    );
    if (user_kundali_obj.kundli_pdf_buy_status) {
      return;
    }
    const payment_link =
      (await orderService.findKundliOrderPaymentLink(user_id)) ||
      (
        await orderService.createAndSendPaymentLink(
          user.user_id,
          KUNDLI_SKU_ID,
          0,
          5,
          251,
          'RAZORPAY',
          true
        )
      ).api_response.data.payment_link.short_url;
    const payment_slug = payment_link.split("/").pop();
    if (!payment_slug) {
      throw _buildError(
        this._logger,
        "SENDING_SAMPLE_KUNDLI",
        "PAYMENT SLUG NOT FOUND",
        { user_id }
      );
    }

    let out_file_path_read_stream: ReadStream,
      out_file_path: string | null = null,
      sample_s3_url: string | undefined = "";
    if (user_kundali_obj?.kundli_pdf_buy_status) {
      return;
    }
    if (!user_kundali_obj?.sample_kundli_pdf_url) {
      ({ out_file_path_read_stream, out_file_path, sample_s3_url } =
        await userService.generateSampleKundli(user.user_uuid));
    } else {
      sample_s3_url = user_kundali_obj.sample_kundli_pdf_url;
      const download_stream = (
        await axios.get(
          await getSignedS3Url({
            s3Url: sample_s3_url,
          }),
          { responseType: "stream" }
        )
      ).data;
      out_file_path = `${KUNDLI_ROOT_DIR}/resources/${user.user_uuid}-sample-kundli.pdf`;
      const write_stream = fs.createWriteStream(out_file_path);
      await pipeline(download_stream, write_stream);
      out_file_path_read_stream = fs.createReadStream(out_file_path);
    }
    const params: WatiSessionSendFileParamType = {
      whatsappNumber: user.phone_number,
      caption: `नमस्ते ${user.user_name} जी,\n\nक्या आप अगले 30 वर्षों के लिए अपने जीवन की 100% सटीक भविष्यवाणी जानना चाहते हैं?\n\nआपकी कुंडली तैयार है। 10 से अधिक ज्योतिषियों द्वारा तैयार और सत्यापित की गई है। ये आपकी कुंडली के पहले कुछ पन्ने हैं।\n\nमात्र 251 रुपये में आप अपनी पूरी कुंडली प्राप्त कर सकते हैं।\n\npayment link: ${payment_link}`,
    };
    const data = new FormData();
    data.append("file", out_file_path_read_stream, "sample-kundali.pdf");
    let response = await this.watiClient.sendSessionFile(
      params,
      data,
      user.phone_number
    );
    if (!response?.result) {
      const selector_response = this.messageTypeSelector(response);
      if (selector_response === "CLOSED") {
        response = await this.sendSampleKundliOnBroadCast(
          user.user_name,
          user.phone_number,
          sample_s3_url,
          payment_slug
        );
      }
    }
    await this.updateReminderState(
      user_id,
      response?.result || false,
      "KUNDLI"
    );
    if (out_file_path) {
      fs.unlinkSync(out_file_path);
    }
  };

  updateReminderState = async (
    user_id: number,
    response: boolean,
    reminder_type: "FEEDBACK" | "KUNDLI" | "UPSELL"
  ) => {
    if (response === false) return;
    try {
      const crm_reminder = await prisma.crm_reminder.findFirst({
        where: {
          user_id,
        },
      });

      const create: {
        kundli_reminder: object;
        feedback_reminder: object;
        upsell_reminder: object;
        aspirer_reminder_sent: boolean;
        explorer_reminder_sent: boolean;
        payer_reminder_sent: boolean;
      } =
        reminder_type === "FEEDBACK"
          ? {
            kundli_reminder: {},
            feedback_reminder: {
              [moment().valueOf()]: true,
            },
            upsell_reminder: {},
            aspirer_reminder_sent: false,
            explorer_reminder_sent: false,
            payer_reminder_sent: false,
          }
          : reminder_type === "KUNDLI"
            ? {
              feedback_reminder: {},
              kundli_reminder: {
                [moment().valueOf()]: true,
              },
              upsell_reminder: {},
              aspirer_reminder_sent: false,
              explorer_reminder_sent: false,
              payer_reminder_sent: false,
            }
            : reminder_type === "UPSELL"
              ? {
                feedback_reminder: {},
                upsell_reminder: {
                  [moment().valueOf()]: true,
                },
                kundli_reminder: {},
                aspirer_reminder_sent: false,
                explorer_reminder_sent: false,
                payer_reminder_sent: false,
              }
              : {
                feedback_reminder: {},
                upsell_reminder: {},
                kundli_reminder: {},
                aspirer_reminder_sent: false,
                explorer_reminder_sent: false,
                payer_reminder_sent: false,
              };

      const update =
        reminder_type === "FEEDBACK"
          ? {
            feedback_reminder: {
              ...JSON.parse(
                JSON.stringify(crm_reminder?.feedback_reminder || {})
              ),
              [moment().valueOf()]: true,
            },
          }
          : reminder_type === "KUNDLI"
            ? {
              kundli_reminder: {
                ...JSON.parse(
                  JSON.stringify(crm_reminder?.kundli_reminder || {})
                ),
                [moment().valueOf()]: true,
              },
            }
            : reminder_type === "UPSELL"
              ? {
                upsell_reminder: {
                  ...JSON.parse(
                    JSON.stringify(crm_reminder?.upsell_reminder || {})
                  ),
                  [moment().valueOf()]: true,
                },
              }
              : {};

      await prisma.crm_reminder.upsert({
        where: {
          user_id,
        },
        create: {
          user_id,
          ...create,
        },
        update: {
          ...update,
        },
      });
    } catch (err: any) {
      this._logger.error({
        stage: "UPDATING_CRM_REMINDER_TABLE",
        error: err,
      });
    }
  };

  sendGroupReminder = async () => {
    await this.sendPayerReminder();
    await this.sendAspirersReminder();
    // await this.sendExplorerReminder();
  };
  _sendReminder = async (
    phone_number: string,
    reminder_type: REMINDER_TYPE
  ) => {
    if (reminder_type === "ASPIRER") {
      const payload = {
        template_name: "group_joining_link",
        broadcast_name: "group_joining_link",
        parameters: [
          {
            name: "group_link",
            value: appConfig.group_reminder_whatsapp_link[reminder_type],
          },
        ],
      };
      const response = await this.watiClient.sendTemplateMessage(
        payload,
        phone_number
      );
      return !!response.result;
    } else if (reminder_type === "EXPLORER") {
      const params: WatiSessionSendFileParamType = {
        whatsappNumber: phone_number,
        caption: `
        अब हर दिन फ्री में प्राप्त करें ज्योतिष टिप्स और वीडियो अपने व्हाट्सएप पर।\n\n*यह ऑफर केवल Jyotisya.ai सदस्यों के लिए है*\n\nनीचे दिए गए लिंक से ग्रुप जॉइन करें।\n\nसीमित स्लॉट ही बचे है\n\nGet free astrology tips and videos like these everyday to your WhatsApp.\n\n*This is exclusive to only Jyotisya.ai members*\n\nJoin the group with the link below.\n\nlimited slots only\n\nGroup Link - ${appConfig.group_reminder_whatsapp_link[reminder_type]}`,
      };
      const data: FormData = new FormData();
      const readstream = createReadStream("./src/resources/group_reminder.mp4");
      data.append("file", readstream, "remmider.mp4");
      let response = await this.watiClient.sendSessionFile(
        params,
        data,
        phone_number
      );
      if (response?.result === true) return true;
      const payload = {
        template_name: "group_joining_link",
        broadcast_name: "group_joining_link",
        parameters: [
          {
            name: "group_link",
            value: appConfig.group_reminder_whatsapp_link[reminder_type],
          },
        ],
      };
      response = await this.watiClient.sendTemplateMessage(
        payload,
        phone_number
      );
      return !!response.result;
    } else if (reminder_type === "PAYER") {
      const params: WatiSessionSendFileParamType = {
        whatsappNumber: phone_number,
        caption: `
          अब हर दिन फ्री में प्राप्त करें ज्योतिष टिप्स और वीडियो अपने व्हाट्सएप पर।\n\n*यह ऑफर केवल Jyotisya.ai सदस्यों के लिए है*\n\nनीचे दिए गए लिंक से ग्रुप जॉइन करें।\n\nसीमित स्लॉट ही बचे है\n\nGet free astrology tips and videos like these everyday to your WhatsApp.\n\n*This is exclusive to only Jyotisya.ai members*\n\nJoin the group with the link below.\n\nlimited slots only\n\nGroup Link - ${appConfig.group_reminder_whatsapp_link[reminder_type]}
        `,
      };
      const data: FormData = new FormData();
      console.log(process.cwd());

      const readstream = createReadStream("./src/resources/group_reminder.mp4");
      data.append("file", readstream, "reminder.mp4");
      let response = await this.watiClient.sendSessionFile(
        params,
        data,
        phone_number
      );
      if (response?.result === true) return true;
      const payload = {
        template_name: "group_joining_link",
        broadcast_name: "group_joining_link",
        parameters: [
          {
            name: "group_link",
            value: appConfig.group_reminder_whatsapp_link[reminder_type],
          },
        ],
      };
      response = await this.watiClient.sendTemplateMessage(
        payload,
        phone_number
      );
      return !!response.result;
    }
    throw _buildError(
      this._logger,
      "SENDING_GROUP_REMIDER",
      "INVALID REMINDER TYPE",
      { phone_number }
    );
  };

  sendExplorerReminder = async () => {
    await userService.updateExplorers();
    const users = (await prisma.$queryRaw`
      SELECT u.user_id, u.phone_number, u.user_uuid from user u 
      LEFT JOIN crm_reminder c 
      ON c.user_id = u.user_id 
      WHERE u.is_explorer = true 
      AND (c.explorer_reminder_sent IS NULL OR c.explorer_reminder_sent <> true)
    `) as user[];
    for (const userObj of users) {
      try {
        const resp = await this._sendReminder(userObj.phone_number, "EXPLORER");
        await this.validateCRMObj(userObj);
        if (resp) {
          await prisma.$queryRaw`
        UPDATE
          crm_reminder
        SET
        explorer_reminder_sent = ${true}
        WHERE
          user_id = ${userObj.user_id}
      `;
        }
      } catch (err: any) {
        this._logger.error({
          stage: "SENDING_EXPLORER_REMINDER",
          error: err,
          data: { user_uuid: userObj.user_uuid },
        });
      }
    }
  };

  sendAspirersReminder = async () => {
    await userService.updateAspirers();
    const users = (await prisma.$queryRaw`
      SELECT distinct u.user_id, u.phone_number, u.user_uuid from user u 
      LEFT JOIN crm_reminder c 
      ON c.user_id = u.user_id 
      WHERE u.is_aspirer = true 
      AND (c.aspirer_reminder_sent IS NULL OR c.aspirer_reminder_sent <> true);;
    `) as user[];
    for (const userObj of users) {
      try {
        await this.validateCRMObj(userObj);
        const resp = await this._sendReminder(userObj.phone_number, "ASPIRER");
        if (resp) {
          await prisma.$queryRaw`
        UPDATE
          crm_reminder
        SET
        aspirer_reminder_sent = true
        WHERE
          user_id = ${userObj.user_id}
      `;
        }
      } catch (err: any) {
        this._logger.error({
          stage: "SENDING_EXPLORER_REMINDER",
          error: err,
          data: { user_uuid: userObj.user_uuid },
        });
      }
    }
  };

  sendPayerReminder = async () => {
    await userService.updatePayers();
    const users = (await prisma.$queryRaw`
    SELECT u.user_id, u.phone_number, u.user_uuid from user u 
    LEFT JOIN crm_reminder c 
    ON c.user_id = u.user_id 
    WHERE u.is_payer = true 
    AND (c.payer_reminder_sent IS NULL OR c.payer_reminder_sent <> true);;
  `) as user[];
    for (const userObj of users) {
      const resp = await this._sendReminder(userObj.phone_number, "PAYER");
      await this.validateCRMObj(userObj);
      if (resp) {
        await prisma.$queryRaw`
      UPDATE
        crm_reminder
      SET
      payer_reminder_sent = true
      WHERE
        user_id = ${userObj.user_id}
    `;
      }
    }
  };

  validateCRMObj = async (userObj: user) => {
    const crm_reminderObj = await prisma.crm_reminder.findFirst({
      where: {
        user_id: userObj.user_id,
      },
    });
    if (!crm_reminderObj) {
      await this.generateCRMObj(userObj);
    }
  };

  async generateCRMObj(userObj: user) {
    await prisma.crm_reminder.create({
      data: {
        user_id: userObj.user_id,
        kundli_reminder: {},
        upsell_reminder: {},
        feedback_reminder: {},
        explorer_reminder_sent: false,
        aspirer_reminder_sent: false,
        payer_reminder_sent: false,
      },
    });
  }

  sendKundli = async (user_id: number) => {
    let user_kundali_obj = await this.userKundliRepo.findOneById(
      "user_id",
      user_id,
      {
        kundli_pdf_url: true,
        sample_kundli_pdf_url: true,
        kundli_pdf_buy_status: true,
      }
    );
    if (!user_kundali_obj) {
      user_kundali_obj = await prisma.user_kundli.create({
        data: {
          user_id,
        },
      });
    }
    if (!user_kundali_obj?.kundli_pdf_url) {
      user_kundali_obj["kundli_pdf_url"] = await userService.generateKundli(
        user_id
      );
    }
    const user = await userService.findUserById(user_id);
    if (!user) {
      throw _buildError(this._logger, "SENDING_KUNDLI", "USER NOT FOUND", {
        user_id,
      });
    }
    const params: WatiSessionSendFileParamType = {
      whatsappNumber: user.phone_number,
      caption: `नमस्ते ${user.user_name} जी,\n\nकृप्या 30 से अधिक वर्षों की भविष्यवाणी के साथ अपनी पूरी कुंडली रिपोर्ट यहां देखें`
    };
    const download_stream = (
      await axios.get(
        await getSignedS3Url({
          s3Url: user_kundali_obj.kundli_pdf_url!,
        }),
        { responseType: "stream" }
      )
    ).data;
    const out_file_path = `${KUNDLI_ROOT_DIR}/resources/${user.user_uuid}-sample-kundli.pdf`;
    const write_stream = fs.createWriteStream(out_file_path);
    await pipeline(download_stream, write_stream);
    const out_file_path_read_stream = fs.createReadStream(out_file_path);
    const data = new FormData();
    data.append("file", out_file_path_read_stream, "kundali.pdf");

    let response = await this.watiClient.sendSessionFile(
      params,
      data,
      user.phone_number
    );
    if (response?.result) {
      const selector_response = this.messageTypeSelector(response);
      if (selector_response === "CLOSED") {
        response = await this.sendKundliOnBroadCast(
          user.user_name,
          user.phone_number,
          user_kundali_obj.kundli_pdf_url!,
        );
      }
    }
    await prisma.user_kundli.update({
      where: {
        user_id,
      },
      data: {
        user_kundli_sent_at: moment().toDate(),
      },
    });
  };

  sendKundliOnBroadCast = async (
    name: string,
    phone_number: string,
    s3Url: string | undefined,
  ) => {
    if (!s3Url) {
      throw _buildError(
        this._logger,
        "brodasting message to session closed user",
        "missing s3 url",
        { phone_number }
      );
    }
    const data = {
      template_name: "kundli_report",
      broadcast_name: "kundli_report",
      parameters: [
        {
          name: "kundli_URL",
          value: await getSignedS3Url({ s3Url }),
        },
        {
          name: "name",
          value: name,
        }
      ],
    };

    const resp = await this.watiClient.sendTemplateMessage(data, phone_number);
    if (resp.result === true) {
      this._logger.info({
        info: `Send sample kundli broadcast successfully to : ${phone_number}`,
        stage: "BRODCAST_KUNDLI_REMINDER",
      });
    } else {
      this._logger.error({
        stage: "BRODCAST_KUNDLI_REMINDER",
        error: "FAILURE IN SENDING KUNDLI",
        data: {
          phone_number,
        },
      });
    }
    return resp;
  };

  kundiBoughtSender = async () => {
    const user_kundali_objs = await prisma.user_kundli.findMany({
      where: {
        kundli_pdf_buy_status: true,
        user_kundli_sent_at: null,
      },
    });
    for (const user_kundali_obj of user_kundali_objs) {
      try {
        await this.sendKundli(user_kundali_obj.user_id);
      } catch (err: any) {
        this._logger.error({
          stage: "SENDING_KUNDLI",
          error: err,
          data: { user_id: user_kundali_obj.user_id },
        });
      }
    }
  };
}
