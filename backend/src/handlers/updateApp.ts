import {
  AppNotFoundError,
  DeploymentError,
  ValidationError,
} from "../service/common/errors.ts";
import { updateApp } from "../service/updateApp.ts";
import { type HandlerMap, json } from "../types.ts";
import { type AuthenticatedRequest } from "./index.ts";

export const updateAppHandler: HandlerMap["updateApp"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  const appData = ctx.request.requestBody;
  try {
    await updateApp(ctx.request.params.appId, req.user.id, appData);
    return json(200, res, {});
  } catch (e) {
    if (e instanceof AppNotFoundError) {
      return json(404, res, { code: 404, message: "App not found" });
    } else if (e instanceof ValidationError) {
      return json(400, res, { code: 400, message: e.message });
    } else if (e instanceof DeploymentError) {
      return json(500, res, {
        code: 500,
        message: "Failed to create a deployment for your app.",
      });
    }
    throw e;
  }
};
