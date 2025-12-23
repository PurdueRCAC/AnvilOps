import { getTemplates } from "../service/getTemplates.ts";
import { json, type HandlerMap } from "../types.ts";

export const getTemplatesHandler: HandlerMap["getTemplates"] = async (
  ctx,
  req,
  res,
) => {
  return json(200, res, await getTemplates());
};
