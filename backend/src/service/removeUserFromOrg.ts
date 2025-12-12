import { db, NotFoundError } from "../db/index.ts";
import { OrgNotFoundError, UserNotFoundError } from "./common/errors.ts";

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
  } catch (e) {
    if (e instanceof NotFoundError) {
      throw new UserNotFoundError();
    }

    throw e;
  }
}
