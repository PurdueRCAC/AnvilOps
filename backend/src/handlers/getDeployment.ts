import { DeploymentNotFoundError } from "../service/common/errors.ts";
import { getDeployment } from "../service/getDeployment.ts";
import { json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const getDeploymentHandler: HandlerMap["getDeployment"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  try {
    const deployment = await getDeployment(
      ctx.request.params.deploymentId,
      req.user.id,
    );
    return json(200, res, deployment);
  } catch (e) {
    if (e instanceof DeploymentNotFoundError) {
      return json(404, res, { code: 404, message: "Deployment not found." });
    }
    throw e;
  }
};
