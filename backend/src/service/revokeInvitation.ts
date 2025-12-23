import { db, NotFoundError } from "../db/index.ts";
import { InvitationNotFoundError } from "./common/errors.ts";

export async function revokeInvitation(
  orgId: number,
  userId: number,
  invitationId: number,
) {
  try {
    await db.invitation.revoke(orgId, invitationId, userId);
  } catch (e) {
    if (e instanceof NotFoundError) {
      throw new InvitationNotFoundError(e);
    }
    throw e;
  }
}
