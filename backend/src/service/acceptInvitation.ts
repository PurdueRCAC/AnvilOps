import { db, NotFoundError } from "../db/index.ts";
import { InvitationNotFoundError } from "./common/errors.ts";

export async function acceptInvitation(
  invitationId: number,
  orgId: number,
  inviteeId: number,
) {
  try {
    await db.invitation.accept(invitationId, orgId, inviteeId);
  } catch (e: any) {
    if (e instanceof NotFoundError) {
      throw new InvitationNotFoundError(e);
    }
    throw e;
  }
}
