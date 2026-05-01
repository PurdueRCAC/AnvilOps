import { logger } from "../logger.ts";
import {
  DeploymentError,
  OrgNotFoundError,
  ValidationError,
} from "../service/errors/index.ts";
import { createAppService } from "../service/index.ts";
import { json, type HandlerMap } from "../types.ts";
import { type AuthenticatedRequest } from "./index.ts";

export const createAppHandler: HandlerMap["createApp"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  let appId: number;
  let createFirstDeployment: () => void;
  try {
    const res = await createAppService.createApp(
      ctx.request.requestBody,
      req.user.id,
    );
    appId = res.appId;
    createFirstDeployment = res.createFirstDeployment;
  } catch (e) {
    if (e instanceof OrgNotFoundError) {
      return json(400, res, { code: 400, message: "Organization not found" });
    } else if (e instanceof ValidationError) {
      return json(400, res, {
        code: 400,
        message: e.message,
      });
    } else {
      logger.error(e, "Failed to create app");
      return json(500, res, {
        code: 500,
        message: "There was a problem creating your app.",
      });
    }
  }

  // Always respond with 200 OK after this since an app was created,
  // although the deployment may fail for other reasons

  try {
    createFirstDeployment();
  } catch (e) {
    if (e instanceof DeploymentError) {
      // The app was created, but a Deployment couldn't be created
      logger.error(e, "Failed to create app's first deployment");
    } else {
      logger.error(e, "Failed to create app");
    }
  }

  return json(200, res, { id: appId });
};
