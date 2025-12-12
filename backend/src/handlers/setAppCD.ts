import { AppNotFoundError } from "../service/common/errors.ts";
import { setAppCD } from "../service/setAppCD.ts";
import { json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const setAppCDHandler: HandlerMap["setAppCD"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  try {
    await setAppCD(
      ctx.request.params.appId,
      req.user.id,
      ctx.request.requestBody.enable,
    );
    return json(200, res, {});
  } catch (e) {
    if (e instanceof AppNotFoundError) {
      return json(404, res, { code: 404, message: "App not found." });
    }
    throw e;
  }
};
