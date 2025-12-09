import { json, type HandlerMap } from "../types.ts";

export const livenessProbe: HandlerMap["livenessProbe"] = (ctx, req, res) => {
  return json(200, res, {});
};
