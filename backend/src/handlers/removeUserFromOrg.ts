import { db, NotFoundError } from "../db/index.ts";
import { json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const removeUserFromOrg: HandlerMap["removeUserFromOrg"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  const org = await db.org.getById(ctx.request.params.orgId, {
    requireUser: { id: req.user.id, permissionLevel: "OWNER" },
  });

  if (!org) {
    return json(403, res, {});
  }

  try {
    await db.org.removeMember(
      ctx.request.params.orgId,
      ctx.request.params.userId,
    );
  } catch (e: any) {
    if (e instanceof NotFoundError) {
      return json(404, res, { code: 404, message: "Not found." });
    }

    throw e;
  }

  return json(204, res, {});
};
