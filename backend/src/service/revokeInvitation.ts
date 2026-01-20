import { db, NotFoundError } from "../db/index.ts";
import { logger } from "../index.ts";
import { InvitationNotFoundError } from "./common/errors.ts";

export async function revokeInvitation(
  orgId: number,
  userId: number,
  invitationId: number,
) {
  try {
    await db.invitation.revoke(orgId, invitationId, userId);
    logger.info(
      { invitationId, userId, orgId },
      "Organization invitation revoked",
    );
  } catch (e) {
    if (e instanceof NotFoundError) {
      throw new InvitationNotFoundError(e);
    }
    throw e;
  }
}
