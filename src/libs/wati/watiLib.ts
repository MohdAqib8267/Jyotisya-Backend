import axios from "axios";
import { Request, Response } from "express";
import moment from "moment";
import { userService } from "../../services/services.factory";

const WATI_API_ENDPOINT = "https://live-server-11138.wati.io";
const WATI_AUTH_HEADER =
  "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIzYzFlNDZhOS05ZDIwLTQ0ZTctYjEwZS0xZjM5MDRhNjJiZDMiLCJ1bmlxdWVfbmFtZSI6Im1hbmlAanlvdGlzeWEuYWkiLCJuYW1laWQiOiJtYW5pQGp5b3Rpc3lhLmFpIiwiZW1haWwiOiJtYW5pQGp5b3Rpc3lhLmFpIiwiYXV0aF90aW1lIjoiMDMvMDIvMjAyMyAxMDowNDoxMSIsImRiX25hbWUiOiIxMTEzOCIsImh0dHA6Ly9zY2hlbWFzLm1pY3Jvc29mdC5jb20vd3MvMjAwOC8wNi9pZGVudGl0eS9jbGFpbXMvcm9sZSI6IkFETUlOSVNUUkFUT1IiLCJleHAiOjI1MzQwMjMwMDgwMCwiaXNzIjoiQ2xhcmVfQUkiLCJhdWQiOiJDbGFyZV9BSSJ9.wtvH-3wSaLzstu2-BVoQZGYydFSHarEwKLJMvqpMuCs";

export const sendWASessionTextMessage = async (
  user_id: number,
  messageText: string
) => {
  const whatsappNumber = await userService.getPhoneNumberByUserId(user_id);
  const url = `${WATI_API_ENDPOINT}/api/v1/sendSessionMessage/${whatsappNumber}`;

  if (!whatsappNumber) {
    console.error("No whatsapp number found for user_id: ", user_id);
    return;
  }

  try {
    await axios.request({
      method: "POST",
      url,
      headers: {
        Authorization: WATI_AUTH_HEADER,
      },
      params: {
        messageText,
      },
    });
  } catch (err) {
    console.error(err);
  }
};

export const sendScheduleCallMessage = async (user_id: number) => {
  const whatsappNumber = await userService.getPhoneNumberByUserId(user_id);
  const url = `${WATI_API_ENDPOINT}/api/v1/sendInteractiveButtonsMessage?whatsappNumber=${whatsappNumber}`;

  if (!whatsappNumber) {
    console.error("No whatsapp number found for user_id: ", user_id);
    return;
  }

  const currentHour = moment()
    .tz(process.env.BUSINESS_HOURS_TIME_ZONE as string)
    .hours();

  const buttons = [];

  const businessHoursStartHour = moment(
    process.env.BUSINESS_HOURS_START as string,
    process.env.BUSINESS_HOURS_FORMAT as string
  ).hours();
  const businessHoursEndHour = moment(
    process.env.BUSINESS_HOURS_END as string,
    process.env.BUSINESS_HOURS_FORMAT as string
  ).hours();

  if (
    currentHour >= businessHoursStartHour &&
    currentHour < businessHoursEndHour
  ) {
    buttons.push({
      text: "Book Now",
    });
  }

  buttons.push({
    text: "Book Later",
  });

  try {
    await axios.request({
      method: "POST",
      url,
      headers: {
        Authorization: WATI_AUTH_HEADER,
      },
      data: {
        header: {
          type: "Text",
          text: "🕒 Schedule your Booking",
        },
        body: `When do you want to book your session?\nआप अपना सेशन कब बुक करना चाहते हैं?\n`,
        footer: "",
        buttons: buttons,
      },
    });
  } catch (err) {
    console.error(err);
  }
};

export const sendRescheduleMessage = async (user_id: number) => {
  const whatsappNumber = await userService.getPhoneNumberByUserId(user_id);
  const url = `${WATI_API_ENDPOINT}/api/v1/sendInteractiveButtonsMessage?whatsappNumber=${whatsappNumber}`;

  if (!whatsappNumber) {
    console.error("No whatsapp number found for user_id: ", user_id);
    return;
  }

  const formattedTime = moment().tz("Asia/Kolkata").format("h:mm A");

  try {
    await axios.request({
      method: "POST",
      url,
      headers: {
        Authorization: WATI_AUTH_HEADER,
      },
      data: {
        header: {
          type: "Image",
          text: "📞 1 Missed Call",
          media: {
            url: "https://jyotisya-public.s3.ap-south-1.amazonaws.com/wa-flow-images/MC.jpg",
          },
        },
        body: `You have 1 missed call from Guruji at ${formattedTime} from *8035468214*.\n\nPlease select a new time for Guruji's call:`,
        footer: "",
        buttons: [
          {
            text: "Book Now",
          },
          {
            text: "Book Later",
          },
        ],
      },
    });
  } catch (err) {
    console.error(err);
  }
};
