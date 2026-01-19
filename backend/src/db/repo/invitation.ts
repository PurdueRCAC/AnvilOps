import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";
import { PermissionLevel } from "../../generated/prisma/enums.ts";
import {
  ConflictError,
  NotFoundError,
  type PrismaClientType,
} from "../index.ts";
import type { Invitation } from "../models.ts";

export class InvitationRepo {
  private client: PrismaClientType;

  constructor(client: PrismaClientType) {
    this.client = client;
  }

  /**
   * Accepts an invitation to join an organization.
   * @param invitationId The ID of the invitation
   * @param orgId The ID of the organization that the invitation is for
   * @param inviteeId The ID of the user that received the invitation
   * @throws {NotFoundError} if an invitation doesn't exist that matches all three parameters
   */
  async accept(invitationId: number, orgId: number, inviteeId: number) {
    try {
      await this.client.$transaction(async (tx) => {
        const invitation = await tx.invitation.delete({
          where: {
            id: invitationId,
            orgId: orgId,
            inviteeId: inviteeId,
          },
        });

        await tx.organizationMembership.create({
          data: {
            organizationId: invitation.orgId,
            permissionLevel: PermissionLevel.USER,
            userId: invitation.inviteeId,
          },
        });
      });
    } catch (e) {
      if (e instanceof PrismaClientKnownRequestError && e.code === "P2025") {
        // https://www.prisma.io/docs/orm/reference/error-reference#p2025
        throw new NotFoundError("invitation", e);
      }
      throw e;
    }
  }

  async listReceived(userId: number): Promise<Invitation[]> {
    return await this.client.invitation.findMany({
      where: { inviteeId: userId },
      include: {
        inviter: { select: { name: true } },
        invitee: { select: { name: true } },
        org: { select: { name: true } },
      },
    });
  }

  async listOutgoingForOrg(orgId: number): Promise<Invitation[]> {
    return await this.client.invitation.findMany({
      where: { orgId: orgId },
      include: {
        inviter: { select: { name: true } },
        invitee: { select: { name: true } },
        org: { select: { name: true } },
      },
    });
  }

  async send(orgId: number, inviterId: number, inviteeId: number) {
    try {
      await this.client.organization.update({
        where: {
          users: { some: { userId: inviterId } },
          id: orgId,
        },
        data: {
          outgoingInvitations: {
            create: {
              inviteeId: inviteeId,
              inviterId: inviterId,
            },
          },
        },
      });
    } catch (e) {
      if (e instanceof PrismaClientKnownRequestError && e.code === "P2025") {
        // https://www.prisma.io/docs/orm/reference/error-reference#p2025
        // "An operation failed because it depends on one or more records that were required but not found."
        throw new NotFoundError("organization", e);
      }
      if (e instanceof PrismaClientKnownRequestError && e.code === "P2002") {
        // Unique constraint failed
        throw new ConflictError("user", e);
      }
      throw e;
    }
  }

  async revoke(orgId: number, invitationId: number, userId: number) {
    try {
      await this.client.invitation.delete({
        where: {
          id: invitationId,
          orgId: orgId,
          OR: [
            // To delete an invitation, the current user must be the inviter, the invitee, or a member of the organization that the invitation is for.
            { inviteeId: userId },
            { inviterId: userId },
            {
              org: {
                users: {
                  some: { userId: userId },
                },
              },
            },
          ],
        },
      });
    } catch (e) {
      if (e instanceof PrismaClientKnownRequestError && e.code === "P2025") {
        throw new NotFoundError("invitation");
      }
      throw e;
    }
  }
}
