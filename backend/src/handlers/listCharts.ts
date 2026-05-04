import { logger } from "../logger.ts";
import {
  ChartsMissingError,
  ValidationError,
} from "../service/errors/index.ts";
import { listChartsService } from "../service/index.ts";
import { json, type HandlerMap } from "../types.ts";
export const listChartsHandler: HandlerMap["listCharts"] = async (
  ctx,
  req,
  res,
) => {
  try {
    return json(200, res, await listChartsService.listCharts());
  } catch (e) {
    if (e instanceof ValidationError) {
      return json(400, res, {
        code: 400,
        message: e.message,
      });
    }

    logger.error(e, "Failed to fetch deployable Helm charts");
    if (e instanceof ChartsMissingError) {
      return json(500, res, {
        code: 500,
        message: "Failed to retrieve Helm Charts",
      });
    } else {
      return json(500, res, {
        code: 500,
        message: "Something went wrong.",
      });
    }
  }
};
