import moment from "moment";
import prisma from "../data/index";
import { KnowlarityServiceParams } from "../types";
import { BaseService } from "./base.service";

import { _buildError, _logError } from "../utils/error";

export default class KnowlarityService extends BaseService {
  constructor(params: KnowlarityServiceParams) {
    super(params);
  }

  validateData(data: any) {
    return true;
  }

  insertKnowlarityBook = async (data_: any) => {
    const data = data_?.data_;

    const knowlarityBook = {
      data,
    };
    console.log(knowlarityBook, "data");

    await this.validateData(knowlarityBook);
    return this.knowlarityRepo.create(knowlarityBook);
  };
}
