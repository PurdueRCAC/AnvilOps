import { db } from "../db/index.ts";
import { OrgNotFoundError } from "./common/errors.ts";
import { deleteApp } from "./deleteApp.ts";

export async function deleteOrgByID(orgId: number, userId: number) {
  const org = await db.org.getById(orgId, {
    requireUser: { id: userId, permissionLevel: "OWNER" },
  });

  if (!org) {
    throw new OrgNotFoundError(null);
  }

  const apps = await db.app.listForOrg(orgId);

  await Promise.all(
    apps.map(async (app) => await deleteApp(app.id, userId, false)),
  );

  await db.org.delete(orgId);
}
