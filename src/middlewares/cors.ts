import cors from "cors";

export const allowCORS = cors({
  allowedHeaders: ["Content-Type", "Authorization", "request-id"],
  // origin: [
  //   "http://localhost:3000",
  //   "http://127.0.0.1:3000"
  // ],
  preflightContinue: false,
});
