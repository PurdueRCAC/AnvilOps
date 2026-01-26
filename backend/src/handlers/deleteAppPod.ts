import { AppNotFoundError } from "../service/common/errors.ts";
import { deleteAppPod } from "../service/deleteAppPod.ts";
import { empty, json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const deleteAppPodHandler: HandlerMap["deleteAppPod"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  try {
    await deleteAppPod(
      ctx.request.params.appId,
      ctx.request.params.podName,
      req.user.id,
    );
  } catch (e) {
    if (e instanceof AppNotFoundError) {
      return json(404, res, { code: 404, message: "App not found." });
    }
    throw e;
  }
  return empty(204, res);
};
