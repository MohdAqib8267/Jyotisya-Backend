import AgentRepository from "../data/repositories/agent.db";
import LeadStatusRepository from "../data/repositories/leadStatus.db";
import UserRepository from "../data/repositories/user.db";
import KnowlarityRepository from "../data/repositories/knowlarity.db";
import Logger from "../utils/log";
import { AGENT_ROLE, BOOKING_TYPE } from "@prisma/client";
import { WatiClient } from "../client/wati.client";
import UserKundliRepository from "../data/repositories/userKundli.db";
import AstrologyAPIClient from "../client/astrologyApi.client";
import JyotisyaLambdaClient from "../client/jyotisya.lambda.client";

export type BaseServiceParams = {
  logger: Logger;
  userRepo: UserRepository;
  agentRepo: AgentRepository;
  leadStatusRepo: LeadStatusRepository;
  knowlarityRepo: KnowlarityRepository;
  config: Readonly<Record<string, any>>;
  userKundliRepo: UserKundliRepository;
  astrologyApiClient: AstrologyAPIClient;
  jyotisyaLambdaApiClient: JyotisyaLambdaClient;
};

export type UserServiceParams = BaseServiceParams & {};

export type AgentServiceParams = BaseServiceParams & {};

export type LeadServiceParams = BaseServiceParams & {};

export type calendarServiceParams = BaseServiceParams & {};

export type KnowlarityServiceParams = BaseServiceParams & {};

export type OrderServiceParams = BaseServiceParams & {};

export type WatiServiceParams = BaseServiceParams & {
  watiClient: WatiClient;
};

export type NewLeadType = {
  user_id: number;
  agent_id: number;
  lead_type: string;
  astro_lead_id?: number;
};

export interface JyotistaJWTAgentInfo {
  agent_id: number;
  role: AGENT_ROLE;
  name: string;
  phone_number: string;
}

export interface JyotisyaJWTPayload extends JyotistaJWTAgentInfo {
  iat: number;
  exp: number;
  iss: string;
}

export interface BusinessHours {
  day_no: number;
  start_time: string;
  end_time: string;
}

export interface SkuWithCustomPricing {
  sku_id: number;
  sku_qty: number;
  custom_price_inr?: number;
}

export type BirthDetails = {
  raw?: {
    date: string;
    time: string;
    city: string;
    state: string;
    country: string;
  };
  agent_input?: {
    updated_by_agent_id?: number;
    user_name: string;
    date: string;
    time: string;
    gender: "male" | "female" | "other";
    geo: {
      utc_offset_minutes: number;
      city: string;
      state: string;
      country: string;
      latitude: number;
      longitude: number;
      place_id: string;
      place_provider: string;
    };
  };
};

export interface MessagePayload {
  message_version: number;
  data: {
    booking_uuid: string;
    is_sticky_agent: boolean;
    booked_at: string;
    pushed_at: string;
    metadata: {
      batch_uuid?: string;
      booking_retry_count: number;
      call_retry_count: number;
    };
  };
}

export interface CallResult {
  is_call_placed: boolean;
  call_id: number;
  message: string;
}

export interface ChildOption {
  child_option_id: number;
  child_text: string;
}

export interface FeedbackOption {
  parent_option_id: number;
  parent_text: string;
  child_array: ChildOption[];
}

export interface SelectedFeedbackOption {
  parent_option_id: number;
  child_option_id: number;
}

export enum PaymentLinkType {
  PAYMENT_LINK,
  QR_CODE,
}

export interface LambdaPaymentProxyPayload {
  amount?: string;
  name?: string;
  customer_name?: string;
  customer_id?: string;
  customer_contact?: string;
  customer_email?: string;
  description?: string;
  skip_wati_message?: boolean;
}

export interface SendPaymentLinkPayload {
  customer_name: string;
  customer_phone: string;
  sku_id: number;
  sku_uuid?: string;
  custom_price_inr?: number;
}

export interface ScheduleBookingPayload {
  customer_phone: string;
  booking_start_hour: number;
  booking_end_hour: number;
  time_zone: string;
}

export interface AddAgentPayload {
  agent_name: string;
  phone_number: string;
  password: string;
  agent_role: AGENT_ROLE;
  agency_id: number;
  agent_earning_config_list: any[];
}

export interface AttendanceDetails {
  days_logged_in: number;
}

export interface AgentEarningDetails {
  total_earning: number;
}

export interface UpsellDetails {
  upsell_count: number;
}

export type REMINDER_TYPE = "EXPLORER" | "ASPIRER" | "PAYER";

export type RequestHeaders = {
  [key: string]: string;
};

export type ExternalAPIRequestDetails = {
  path: string;
  method: string;
  expansionParams?: any;
  queryParams?: any;
  payload?: any;
};

export type ExternalAPIResponseMetadata = {
  status_code: number;
  response_time: number;
  headers: {
    content_type?: string;
  };
};

export type ExternalAPIResponseBody = {
  data: any;
};
