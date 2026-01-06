import { listCharts } from "../service/listCharts.ts";
import { json, type HandlerMap } from "../types.ts";
export const listChartsHandler: HandlerMap["listCharts"] = async (
  ctx,
  req,
  res,
) => {
  try {
    return json(200, res, await listCharts());
  } catch (e) {
    console.error(e);
    return json(500, res, {
      code: 500,
      message: "Something went wrong.",
    });
  }
};
