import axios from "axios";
import { Response } from "express";

export const sendErrorResponse = (
  res: Response,
  status: number = 500,
  message: string = "An error occurred"
) => {
  res.status(status).json({
    success: false,
    message: message,
  });
};

export const callApi = async (
  url: string,
  method: string,
  payload?: Object
) => {
  if (method.toUpperCase() === "POST") {
    return await axios({
      url,
      method,
      data: payload,
    });
  } else if (method.toUpperCase() === "GET") {
    return await axios({
      url,
      method,
    });
  }
};
