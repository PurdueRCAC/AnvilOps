import {
  DeploymentNotFoundError,
  ValidationError,
} from "../service/common/errors.ts";
import { updateDeployment } from "../service/updateDeployment.ts";
import { json, type HandlerMap } from "../types.ts";

export const updateDeploymentHandler: HandlerMap["updateDeployment"] = async (
  ctx,
  req,
  res,
) => {
  const { secret, status } = ctx.request.requestBody;
  try {
    await updateDeployment(secret, status);
    return json(200, res, undefined);
  } catch (e) {
    if (e instanceof ValidationError) {
      return json(404, res, { code: 400, message: e.message });
    } else if (e instanceof DeploymentNotFoundError) {
      return json(404, res, { code: 404, message: "Deployment not found." });
    }
    throw e;
  }
};
