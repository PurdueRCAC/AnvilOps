import { db, NotFoundError } from "../db/index.ts";
import { json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const claimOrg: HandlerMap["claimOrg"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  const unassignedInstallationId =
    ctx.request.requestBody.unclaimedInstallationId;
  const orgId = ctx.request.params.orgId;
  try {
    await db.org.claimInstallation(
      orgId,
      unassignedInstallationId,
      req.user.id,
    );
  } catch (e) {
    if (e instanceof NotFoundError) {
      switch (e.message) {
        case "installation":
          return json(404, res, {
            code: 404,
            message: "Installation does not exist.",
          });
        case "organization":
          return json(404, res, {
            code: 404,
            message: "Organization does not exist.",
          });
      }
    }

    throw e;
  }
  return json(200, res, {});
};
