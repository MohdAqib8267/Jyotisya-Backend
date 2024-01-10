import { WatiClientConfigTypes } from "../types";

const WatiClientConfig: Record<string, WatiClientConfigTypes> = {
  development: {
    BASE_URL: "https://live-server-11138.wati.io",
    TOKEN:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIzYzFlNDZhOS05ZDIwLTQ0ZTctYjEwZS0xZjM5MDRhNjJiZDMiLCJ1bmlxdWVfbmFtZSI6Im1hbmlAanlvdGlzeWEuYWkiLCJuYW1laWQiOiJtYW5pQGp5b3Rpc3lhLmFpIiwiZW1haWwiOiJtYW5pQGp5b3Rpc3lhLmFpIiwiYXV0aF90aW1lIjoiMDMvMDIvMjAyMyAxMDowNDoxMSIsImRiX25hbWUiOiIxMTEzOCIsImh0dHA6Ly9zY2hlbWFzLm1pY3Jvc29mdC5jb20vd3MvMjAwOC8wNi9pZGVudGl0eS9jbGFpbXMvcm9sZSI6IkFETUlOSVNUUkFUT1IiLCJleHAiOjI1MzQwMjMwMDgwMCwiaXNzIjoiQ2xhcmVfQUkiLCJhdWQiOiJDbGFyZV9BSSJ9.wtvH-3wSaLzstu2-BVoQZGYydFSHarEwKLJMvqpMuCs",
  },
  test: {
    BASE_URL: "https://live-server-11138.wati.io",
    TOKEN:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIzYzFlNDZhOS05ZDIwLTQ0ZTctYjEwZS0xZjM5MDRhNjJiZDMiLCJ1bmlxdWVfbmFtZSI6Im1hbmlAanlvdGlzeWEuYWkiLCJuYW1laWQiOiJtYW5pQGp5b3Rpc3lhLmFpIiwiZW1haWwiOiJtYW5pQGp5b3Rpc3lhLmFpIiwiYXV0aF90aW1lIjoiMDMvMDIvMjAyMyAxMDowNDoxMSIsImRiX25hbWUiOiIxMTEzOCIsImh0dHA6Ly9zY2hlbWFzLm1pY3Jvc29mdC5jb20vd3MvMjAwOC8wNi9pZGVudGl0eS9jbGFpbXMvcm9sZSI6IkFETUlOSVNUUkFUT1IiLCJleHAiOjI1MzQwMjMwMDgwMCwiaXNzIjoiQ2xhcmVfQUkiLCJhdWQiOiJDbGFyZV9BSSJ9.wtvH-3wSaLzstu2-BVoQZGYydFSHarEwKLJMvqpMuCs",
  },
  beta: {
    BASE_URL: "https://live-server-11138.wati.io",
    TOKEN:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIzYzFlNDZhOS05ZDIwLTQ0ZTctYjEwZS0xZjM5MDRhNjJiZDMiLCJ1bmlxdWVfbmFtZSI6Im1hbmlAanlvdGlzeWEuYWkiLCJuYW1laWQiOiJtYW5pQGp5b3Rpc3lhLmFpIiwiZW1haWwiOiJtYW5pQGp5b3Rpc3lhLmFpIiwiYXV0aF90aW1lIjoiMDMvMDIvMjAyMyAxMDowNDoxMSIsImRiX25hbWUiOiIxMTEzOCIsImh0dHA6Ly9zY2hlbWFzLm1pY3Jvc29mdC5jb20vd3MvMjAwOC8wNi9pZGVudGl0eS9jbGFpbXMvcm9sZSI6IkFETUlOSVNUUkFUT1IiLCJleHAiOjI1MzQwMjMwMDgwMCwiaXNzIjoiQ2xhcmVfQUkiLCJhdWQiOiJDbGFyZV9BSSJ9.wtvH-3wSaLzstu2-BVoQZGYydFSHarEwKLJMvqpMuCs",
  },
  production: {
    BASE_URL: "https://live-server-11138.wati.io",
    TOKEN:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIzYzFlNDZhOS05ZDIwLTQ0ZTctYjEwZS0xZjM5MDRhNjJiZDMiLCJ1bmlxdWVfbmFtZSI6Im1hbmlAanlvdGlzeWEuYWkiLCJuYW1laWQiOiJtYW5pQGp5b3Rpc3lhLmFpIiwiZW1haWwiOiJtYW5pQGp5b3Rpc3lhLmFpIiwiYXV0aF90aW1lIjoiMDMvMDIvMjAyMyAxMDowNDoxMSIsImRiX25hbWUiOiIxMTEzOCIsImh0dHA6Ly9zY2hlbWFzLm1pY3Jvc29mdC5jb20vd3MvMjAwOC8wNi9pZGVudGl0eS9jbGFpbXMvcm9sZSI6IkFETUlOSVNUUkFUT1IiLCJleHAiOjI1MzQwMjMwMDgwMCwiaXNzIjoiQ2xhcmVfQUkiLCJhdWQiOiJDbGFyZV9BSSJ9.wtvH-3wSaLzstu2-BVoQZGYydFSHarEwKLJMvqpMuCs",
  },
};

export const watiConfig = Object.freeze(
  WatiClientConfig[process.env.NODE_ENV || "development"]
);
