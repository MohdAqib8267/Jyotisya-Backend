import { BOOKING_STATUS } from "@prisma/client";
import { orderService, watiService } from "../services/services.factory";

// test()
import fs from "fs";
import { watiClient } from "../client";
import { writeFile } from "fs/promises";
import axios from "axios";
import FormData from "form-data";
import { scriptRunner } from "../utils/common/bash.runner";

async function testFuncTemplate() {
  const val = await watiClient.sendTemplateMessage(
    {
      template_name: "daily_horoscope_english",
      broadcast_name: "daily_horoscope_english",
      parameters: [
        // {
        //   "name": "Image_URL",
        //   "value": "https://picsum.photos/200/300"
        // },
        // {
        //   "name": "payment_link",
        //   "value": "https://picsum.photos/200/300"
        // }
      ],
    },
    "917676584602"
  );
  console.log(val);
}

/**
 * {
      result: false,
      message: "Ticket has been expired.",
      ticketStatus: "CLOSED",
    }

    {
      result: false,
      message: "Ticket has been expired.",
      ticketStatus: "CLOSED",
    },
    { 
      result: false, 
      info: 'Invalid Contact' 
    },

    {
  ok: true,
  result: "success",
  message: {
    whatsappMessageId: "wamid.HBgMOTE4MzQwNTYyMDM2FQIAERgSQTczQjMzRUE4MzI2NUVCODMwAA==",
    localMessageId: "301afb86-7eca-4faf-ae9a-fcac444a3c16",
    text: "Hi",
    media: null,
    messageContact: null,
    location: null,
    type: "text",
    time: "1684239568",
    status: 1,
    statusString: null,
    isOwner: true,
    isUnread: false,
    ticketId: "646293de390e7b763855ab44",
    avatarUrl: null,
    assignedId: "62ceae80ea728417e9106e52",
    operatorName: null,
    replyContextId: null,
    sourceType: 0,
    failedDetail: null,
    messageReferral: null,
    messageProducts: null,
    orderProducts: null,
    id: "646374d13d050025e5aae6ef",
    created: "2023-05-16T12:19:28.1284983Z",
    conversationId: "63c28bd48a72416e8d8f783f",
  },
}
 */

async function testFuncSession() {
  const val = await watiClient.sendSessionMessage(
    {
      whatsappNumber: "8340562036",
      messageText: "Hi",
    },
    "8340562036"
  );
  console.log(val);
}

/**
 * {
      result: false,
      info: "Invalid Contact",
    },
    { result: false, info: 'Invalid Contact' }
 */
async function testFuncSessionFile() {
  // const file = await fs.readFile("./test.jpeg", 'base64');

  const data = new FormData();
  const fileStream = fs.createReadStream("./test.jpeg");
  data.append("file", fileStream, "test.jpg");
  const val = await watiClient.sendSessionFile(
    {
      whatsappNumber: "9769739681",
      caption: "Hi",
    },
    data,
    "9769739681"
  );
  console.log(val);
}

async function testGetContact() {
  const val = await watiClient.getContact({ pageSize: 10000 });
  writeFile("./out.txt", JSON.stringify(val));
}

async function testPdfGen() {
  const pid = await scriptRunner(
    "/Users/maniy/jyotisya/jyotisya-ai/dist/scripts/bash/pdf.sh",
    [
      "7",
      "/Users/maniy/jyotisya/jyotisya-ai/dist/resources/in.pdf",
      "/Users/maniy/jyotisya/jyotisya-ai/dist/resources/append.pdf",
      "/Users/maniy/jyotisya/jyotisya-ai/dist/resources/qwertyuio.pdf",
      "/Users/maniy/jyotisya/jyotisya-ai/dist/resources/out.pdf",
      // "/Users/maniy/jyotisya/jyotisya-ai/dist/resources/out.1.pdf"
    ]
  );
  console.log(pid);
}

// testPdfGen()

const testGroupText = async () => {
  const data = await watiService.sendGroupReminder();
};

// testGroupText();

watiService.kundliReminder();
