import { logger } from "../index.ts";
import {
  DeploymentNotFoundError,
  ValidationError,
} from "../service/common/errors.ts";
import { updateDeployment } from "../service/updateDeployment.ts";
import { empty, json, type HandlerMap } from "../types.ts";

export const updateDeploymentHandler: HandlerMap["updateDeployment"] = async (
  ctx,
  req,
  res,
) => {
  const { secret, status } = ctx.request.requestBody;
  try {
    await updateDeployment(secret, status);
    return empty(204, res);
  } catch (e) {
    if (e instanceof ValidationError) {
      return json(404, res, { code: 400, message: e.message });
    } else if (e instanceof DeploymentNotFoundError) {
      return json(404, res, { code: 404, message: "Deployment not found." });
    }
    logger.error(e, "Failed to update deployment");
    throw e;
  }
};
