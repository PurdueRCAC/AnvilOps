import { env } from "../lib/env.ts";
import { json, type HandlerMap } from "../types.ts";

export const getSettings: HandlerMap["getSettings"] = (ctx, req, res) => {
  return json(200, res, {
    appDomain: env.APP_DOMAIN,
    storageEnabled: env.STORAGE_CLASS_NAME !== undefined,
  });
};
