import { json, type HandlerMap } from "../types.ts";

export const ingestLogs: HandlerMap["ingestLogs"] = async (ctx, req, res) => {
  console.log("Received log: ", ctx.request.body);

  return json(200, res, {});
};
