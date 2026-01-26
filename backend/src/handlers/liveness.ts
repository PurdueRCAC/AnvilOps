import { empty, type HandlerMap } from "../types.ts";

export const livenessProbe: HandlerMap["livenessProbe"] = (ctx, req, res) => {
  return empty(200, res);
};
