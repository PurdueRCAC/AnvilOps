import { db } from "../db/index.ts";
import { logger } from "../logger.ts";
import { deleteApp } from "./deleteApp.ts";
import { OrgNotFoundError } from "./errors/index.ts";

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
  logger.info({ orgId, userId }, "Organization deleted");
}
