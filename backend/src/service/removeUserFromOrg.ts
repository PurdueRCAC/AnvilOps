import { db, NotFoundError } from "../db/index.ts";
import { logger } from "../logger.ts";
import { OrgNotFoundError, UserNotFoundError } from "./errors/index.ts";

export async function removeUserFromOrg(
  orgId: number,
  actorId: number,
  userId: number,
) {
  const org = await db.org.getById(orgId, {
    requireUser: { id: actorId, permissionLevel: "OWNER" },
  });

  if (!org) {
    throw new OrgNotFoundError(null);
  }

  try {
    await db.org.removeMember(orgId, userId);
    logger.info(
      { orgId, userId: actorId, removedUserId: userId },
      "User removed from organization",
    );
  } catch (e) {
    if (e instanceof NotFoundError) {
      throw new UserNotFoundError();
    }

    throw e;
  }
}
