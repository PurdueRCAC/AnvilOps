import { ConflictError, db, NotFoundError } from "../db/index.ts";
import { logger } from "../index.ts";
import {
  OrgNotFoundError,
  UserNotFoundError,
  ValidationError,
} from "./common/errors.ts";

export async function inviteUser(
  inviterId: number,
  orgId: number,
  inviteeEmail: string,
) {
  const otherUser = await db.user.getByEmail(inviteeEmail);

  if (otherUser === null) {
    throw new UserNotFoundError();
  }

  if (otherUser.id === inviterId) {
    throw new ValidationError("You cannot send an invitation to yourself.");
  }

  try {
    await db.invitation.send(orgId, inviterId, otherUser.id);
    logger.info(
      { orgId, inviterId, inviteeId: otherUser.id },
      "Organization invitation sent",
    );
  } catch (e) {
    if (e instanceof NotFoundError && e.message === "organization") {
      throw new OrgNotFoundError(null);
    }
    if (e instanceof ConflictError && e.message === "user") {
      throw new ConflictError("user");
    }
    throw e;
  }
}
