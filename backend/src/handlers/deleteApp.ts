import { logger } from "../index.ts";
import { AppNotFoundError } from "../service/common/errors.ts";
import { deleteApp } from "../service/deleteApp.ts";
import { empty, json, type HandlerMap } from "../types.ts";
import { type AuthenticatedRequest } from "./index.ts";

export const deleteAppHandler: HandlerMap["deleteApp"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  const appId = ctx.request.params.appId;
  try {
    await deleteApp(appId, req.user.id, ctx.request.requestBody.keepNamespace);
    return empty(204, res);
  } catch (e) {
    if (e instanceof AppNotFoundError) {
      return json(404, res, { code: 404, message: "App not found" });
    } else {
      logger.error(e, "Failed to delete app");
      return json(500, res, { code: 500, message: "Failed to delete app" });
    }
  }
};
