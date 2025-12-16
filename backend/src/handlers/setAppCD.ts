import { db } from "../db/index.ts";
import { json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const setAppCD: HandlerMap["setAppCD"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  const app = await db.app.getById(ctx.request.params.appId, {
    requireUser: { id: req.user.id },
  });

  if (!app) {
    return json(404, res, { code: 404, message: "App not found." });
  }

  await db.app.setEnableCD(
    ctx.request.params.appId,
    ctx.request.requestBody.enable,
  );

  return json(200, res, {});
};
