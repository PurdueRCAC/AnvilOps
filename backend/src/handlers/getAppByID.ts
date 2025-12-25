import { AppNotFoundError } from "../service/common/errors.ts";
import { getAppByID } from "../service/getAppByID.ts";
import { json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const getAppByIDHandler: HandlerMap["getAppByID"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  try {
    const info = await getAppByID(ctx.request.params.appId, req.user.id);
    return json(200, res, info);
  } catch (e) {
    if (e instanceof AppNotFoundError) {
      return json(404, res, { code: 404, message: "App not found." });
    }
    throw e;
  }
};
