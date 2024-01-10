import express, { Request, Response, Router } from "express";
import { health } from "./rest/health";
import { forward } from "./rest/requestForward";
import { currentTime } from "./rest/timeStamp";
import {
  addNewAgent,
  authorizeAgent,
  getAgentOnlineStatus,
  setAgentOnlineStatus,
  getAuthenticatedAgentDetails,
  getPendingPaymentLeads,
  hashPassword,
  getCallLogs,
  getAgentLeads,
  getAgentAnalytics,
  getAllAstrologers
} from "./rest/agent.controller";
import {
  setBusinessHours,
  getAstroBookings,
  getBusinessHours,
} from "./rest/calendar.controller";
import {
  adminAuthMiddleware,
  astroAndRmAuthMiddleware,
  astroAuthMiddleWare,
  rmAuthMiddleware,
} from "../middlewares";
import { processKnowlarityWebhook } from "./rest/knowlarity.controller";
import { processWatiWebhook } from "./rest/watiWebhookHandler";
import {
  addUser,
  fulfillPendingBookings,
  getStickyAgent,
  searchUsers,
  removeIsoCode,
  saveCallingNumber,
  setStickyAgent,
  updateUserDetails,
  processAllAwaitingScheduleBookings,
  sendGroupLink,
  sampleKundliReminder,
  sendKundli,
  updateAgentForUser,
  updatePostBookingAgentForUser,
} from "./rest/user.controller";
import { processRazorpayWebhook } from "../libs/razorpay/verifyWebhook";
import watiAuthMiddleware from "../libs/wati/watiAuthMiddleware";
import { feedbackOptions, saveFeedbackResponse } from "./rest/Feedback";
import { kundliGenerator } from "./rest/kundli.controller";
import {
  lambdaPaymentProxyHandler,
  sendPaymentLink,
  forceScheduleBooking,
  getSKUList,
  getExtendCallOptions,
  extendBooking,
  placePhoneCall,
  processAllScheduledBookings,
  deferErroredCalls,
  getSKUCategoryListWithAgencyDefaultPerc,
  scheduleSession,
} from "./rest/order.controller";

import { externalApiCacheHandler } from "./rest/apiCache.controller";

const routes = express.Router();


routes.get("/", health);
routes.get("/current/time/ist", currentTime);

// Unauthenticated Endpoints
routes.post("/agent/authorize", authorizeAgent);
routes.post("/forward/telecrm", forward); // Called by Wati on New User Info Input after payment
// For v2 Flow
routes.post("/lambdaProxy/generatePaymentLink", lambdaPaymentProxyHandler); // Called by Wati

// Webhooks
// routes.post('/webhooks/telecrm', processTelecrmEvent);
routes.post("/webhooks/knowlarity", processKnowlarityWebhook);
routes.post("/webhooks/razorpay", processRazorpayWebhook);
routes.post("/webhooks/wati", processWatiWebhook);

// Kundali generation
routes.post("/kundali/", kundliGenerator);
// routes.post('/razorpay/transaction/dump', addPayment);
// End Unauthenticated Endpoints

// For v3 Flow
routes.post(
  "/integrations/wati/send_payment_link",
  watiAuthMiddleware,
  sendPaymentLink
);
routes.post(
  "/integrations/wati/schedule_booking",
  watiAuthMiddleware,
  forceScheduleBooking
);
routes.post(
  "/integrations/wati/save_calling_number",
  watiAuthMiddleware,
  saveCallingNumber
);
routes.post(
  "/integrations/wati/remove_isd_code",
  watiAuthMiddleware,
  removeIsoCode
);

routes.get("/users", rmAuthMiddleware, searchUsers);
routes.get("/products", rmAuthMiddleware, getSKUList);
routes.get(
  "/products/categories",
  rmAuthMiddleware,
  getSKUCategoryListWithAgencyDefaultPerc
);

routes.post("/orders", rmAuthMiddleware, sendPaymentLink);

routes.get("/all/astrologers",rmAuthMiddleware,getAllAstrologers);
//update astro (pre booking)
routes.put("/update/astro",rmAuthMiddleware,updateAgentForUser);
//change book astro
routes.put("/update/post/booking/astro",rmAuthMiddleware,updatePostBookingAgentForUser);
//schedule session
routes.post("/schedule/session",rmAuthMiddleware,scheduleSession);


routes.get(
  "/agent/me/online_status",
  astroAuthMiddleWare,
  getAgentOnlineStatus
);
routes.post(
  "/agent/me/online_status",
  astroAuthMiddleWare,
  setAgentOnlineStatus
); // Agent::update_status

routes.get("/agent/me/leads", astroAuthMiddleWare, getAgentLeads);
routes.get("/agent/me/analytics", astroAuthMiddleWare, getAgentAnalytics);
routes.get(
  "/agent/me/",
  astroAndRmAuthMiddleware,
  getAuthenticatedAgentDetails
);

routes.post("/agent/add", adminAuthMiddleware, addNewAgent); // Agent::create

routes.get(
  "/agent/:agent_id/availability",
  astroAuthMiddleWare,
  getBusinessHours
); // Agent::get_business_hours
routes.post(
  "/agent/:agent_id/availability",
  astroAuthMiddleWare,
  setBusinessHours
); // Agent::set_business_hours

routes.get(
  "/bookings/:booking_uuid/feedback_options",
  astroAuthMiddleWare,
  feedbackOptions
);
routes.get(
  "/bookings/:booking_uuid/extend_call_options",
  astroAuthMiddleWare,
  getExtendCallOptions
);
routes.post(
  "/bookings/:booking_uuid/extend",
  astroAuthMiddleWare,
  extendBooking
);
routes.post(
  "/bookings/:booking_uuid/phone_call",
  astroAuthMiddleWare,
  placePhoneCall
);

routes.post(
  "/bookings/:phone_number/rm_phone_call",
  rmAuthMiddleware,
  placePhoneCall
);
routes.post(
  "/bookings/:booking_uuid/feedback",
  astroAuthMiddleWare,
  saveFeedbackResponse
);
routes.post(
  "/bookings/:booking_uuid/update_lead",
  astroAuthMiddleWare,
  updateUserDetails
);

// routes.post('/user', authMiddleWare, addUser);
// routes.put('/user/:user_uuid', authMiddleWare, updateUser);
// routes.delete('/user/:id', authMiddleWare, delUser);

routes.post("/calendar/calendarData", astroAuthMiddleWare, getAstroBookings);
// routes.post('/astrobooking/bookinginsert', authMiddleWare, astroBookingDataInsert);

routes.post("/users/:user_id/agents", astroAuthMiddleWare, setStickyAgent);

routes.get("/users/:user_id/agents", astroAuthMiddleWare, getStickyAgent);

routes.get(
  "/agent/me/potential_leads",
  astroAuthMiddleWare,
  getPendingPaymentLeads
);
routes.get("/agent/me/call_logs", astroAuthMiddleWare, getCallLogs);

routes.use("/api-proxy/:api_id", astroAuthMiddleWare, externalApiCacheHandler);

// Hacks
routes.get("/fulfill/:user_id", fulfillPendingBookings);
routes.get(
  "/forced_update/awaiting_schedule/all",
  processAllAwaitingScheduleBookings
);
// For Cron
routes.get("/fulfill_all", processAllScheduledBookings);
routes.get("/cron/defer_errored_calls", deferErroredCalls);
routes.get("/cron/shareGrouplinks", sendGroupLink);
routes.get("/cron/sampleKundliReminder", sampleKundliReminder);
routes.get("/cron/sendKundli", sendKundli);


routes.get("/utils/hash/:password", hashPassword);

export default routes;
