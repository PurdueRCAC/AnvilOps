import { db } from "../db/index.ts";
import { json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const listOrgGroups: HandlerMap["listOrgGroups"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  const orgId = ctx.request.params.orgId;

  const [org, appGroups] = await Promise.all([
    db.org.getById(orgId, { requireUser: { id: req.user.id } }),
    db.appGroup.listForOrg(orgId),
  ]);

  if (org === null) {
    return json(404, res, { code: 404, message: "Organization not found." });
  }

  return json(
    200,
    res,
    appGroups.map((group) => ({
      id: group.id,
      name: group.name,
    })),
  );
};
