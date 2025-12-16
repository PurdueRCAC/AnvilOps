import { db } from "../db/index.ts";
import { json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const createOrg: HandlerMap["createOrg"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  const orgName = ctx.request.requestBody.name;
  const result = await db.org.create(orgName, req.user.id);

  return json(200, res, {
    id: result.id,
    name: result.name,
    permissionLevel: "OWNER",
    githubConnected: !!result.githubInstallationId,
  });
};
