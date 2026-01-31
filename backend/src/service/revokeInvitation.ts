import { db, NotFoundError } from "../db/index.ts";
import { logger } from "../logger.ts";
import { InvitationNotFoundError } from "./errors/index.ts";

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
