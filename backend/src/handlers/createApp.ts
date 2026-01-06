import {
  DeploymentError,
  OrgNotFoundError,
  ValidationError,
} from "../service/common/errors.ts";
import { createApp } from "../service/createApp.ts";
import { json, type HandlerMap } from "../types.ts";
import { type AuthenticatedRequest } from "./index.ts";

export const createAppHandler: HandlerMap["createApp"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  try {
    const appId = await createApp(ctx.request.requestBody, req.user.id);
    return json(200, res, { id: appId });
  } catch (e) {
    if (e instanceof OrgNotFoundError) {
      return json(400, res, { code: 400, message: "Organization not found" });
    } else if (e instanceof ValidationError) {
      return json(400, res, {
        code: 400,
        message: e.message,
      });
    } else if (e instanceof DeploymentError) {
      // The app was created, but a Deployment couldn't be created
      return json(500, res, {
        code: 500,
        message: "Failed to create a deployment for your app.",
      });
    } else {
      console.error(e);
      return json(500, res, {
        code: 500,
        message: "There was a problem creating your app.",
      });
    }
  }
};
