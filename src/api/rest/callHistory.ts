import { Request, response, Response } from "express";
import { agentService, orderService } from "../../services/services.factory";
import {
  agent_booking,
  phone_call,
  order,
  agent_booking_feedback,
  user,
  user_concerns,
  user_concern_list,
  Prisma,
  PrismaClient,
} from "@prisma/client";

const prisma = new PrismaClient();

// export const getCallHistory = async (req: Request, res: Response) => {
//   const agent_id = parseInt(req.params.agent_id) as number;

//   const records = await prisma.phone_call.findFirst({
//     where: {
//       agent_id: agent_id,
//       NOT: {
//         user_answered_at: null,
//       },
//     },
//   });

//   const agent_booking_feedback = await prisma.agent_booking_feedback.findMany({
//     where: {
//       booking_id: records?.booking_id,
//     },
//     select: {
//       selected_options: true,
//     },
//     distinct: ["selected_options"],
//   });

//   // const interestedFeedback = agent_booking_feedback
//   //   .filter((fb: any) => {
//   //     const options = Object.keys(fb.selected_options);
//   //     return options.some((option) => option.includes("Interested in"));
//   //   })
//   //   .map((fb: any) => {
//   //     const interestedOptions = Object.entries(fb.selected_options)
//   //       .filter(([option]) => option.includes("Interested in"))
//   //       .map(([option, value]) => ({ [option]: value }));
//   //     return { selected_options: Object.assign({}, ...interestedOptions) };
//   //   });

//   const interestedFeedback = agent_booking_feedback
//     .map((record) => record.selected_options)
//     .filter((options: any) => {
//       const keys = Object.keys(options);
//       return keys.length > 0 && keys[0].startsWith("Interested in");
//     });

//   const allSelectedOptions: string[] = [];
//   agent_booking_feedback.forEach((feedback: any) => {
//     const selectedOptions = feedback.selected_options;
//     const keys = Object.keys(selectedOptions);
//     keys.forEach((key) => {
//       if (key.startsWith("Interested in")) {
//         if (key === "Interested in") {
//           if (selectedOptions[key].length > 0) {
//             allSelectedOptions.push(...selectedOptions[key]);
//           }
//         } else if (key.startsWith("Interested in ")) {
//           allSelectedOptions.push(key);
//         } else {
//           allSelectedOptions.push(...selectedOptions[key]);
//         }
//       }
//     });
//   });

//   const interestedInList = [...new Set(allSelectedOptions)].join(", ");

//   // const interestedFeedbackString = interestedFeedback
//   //   .map((fb: any) => {
//   //     const interestedOptions = Object.values(
//   //       fb.selected_options
//   //     )[0] as Array<string>;

//   //     // If the interested option is "Interested in", return all values separated by commas
//   //     if (Object.keys(fb.selected_options)[0] === "Interested in") {
//   //       return `${interestedOptions.join(", ")}`;
//   //     }

//   //     // If the interested option is a specific service, add it to the string
//   //     const serviceName = Object.keys(fb.selected_options)[0];
//   //     return `${serviceName}: ${interestedOptions.join(", ")}`;
//   //   })
//   //   .join("; ");

//   const agent_booking = await prisma.agent_booking.findUnique({
//     where: {
//       booking_id: records?.booking_id,
//     },
//     select: {
//       order_id: true,
//     },
//   });

//   const order = await prisma.order.findUnique({
//     where: {
//       order_id: agent_booking?.order_id,
//     },
//     select: {
//       total_amount_inr: true,
//     },
//   });

//   const user = await prisma.user.findUnique({
//     where: {
//       user_id: records?.user_id,
//     },
//     select: {
//       user_name: true,
//     },
//   });

//   const call_time = records?.user_answered_at;

//   console.log(records?.call_id);
//   console.log("booking_id", records?.booking_id);
//   // console.log(agent_booking?.order_id);
//   console.log("rs.", order?.total_amount_inr);
//   console.log("name:", user?.user_name);
//   console.log("feeedback:", agent_booking_feedback);
//   console.log("feedback:", interestedFeedback);
//   console.log("feedback:", interestedInList);
//   console.log("call_time", call_time);
//   // console.log("feedbackString:", interestedFeedbackString);
//   // console.log(records.length);
// };
