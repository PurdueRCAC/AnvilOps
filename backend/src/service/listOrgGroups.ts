import { db } from "../db/index.ts";
import { OrgNotFoundError } from "./common/errors.ts";

export async function listOrgGroups(orgId: number, userId: number) {
  const [org, appGroups] = await Promise.all([
    db.org.getById(orgId, { requireUser: { id: userId } }),
    db.appGroup.listForOrg(orgId),
  ]);

  if (org === null) {
    throw new OrgNotFoundError(null);
  }

  return appGroups.map((group) => ({
    id: group.id,
    name: group.name,
  }));
}
