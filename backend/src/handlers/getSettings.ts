import { getSettings } from "../service/getSettings.ts";
import { json, type HandlerMap } from "../types.ts";

export const getSettingsHandler: HandlerMap["getSettings"] = async (
  ctx,
  req,
  res,
) => {
  return json(200, res, await getSettings());
};
