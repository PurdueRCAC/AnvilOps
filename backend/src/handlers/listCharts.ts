import { listCharts } from "../service/listCharts.ts";
import { json, type HandlerMap } from "../types.ts";
export const listChartsHandler: HandlerMap["listCharts"] = async (
  ctx,
  req,
  res,
) => {
  return json(200, res, await listCharts());
};
