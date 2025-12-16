import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";
import {
  PermissionLevel,
  type UnassignedInstallation,
} from "../../generated/prisma/client.ts";
import { NotFoundError, type PrismaClientType } from "../index.ts";
import type { Organization, OrgMembership } from "../models.ts";

export class OrganizationRepo {
  private client: PrismaClientType;

  constructor(client: PrismaClientType) {
    this.client = client;
  }

  async create(name: string, ownerUserId: number): Promise<Organization> {
    return await this.client.organization.create({
      data: {
        name: name,
        users: {
          create: {
            permissionLevel: "OWNER",
            user: {
              connect: { id: ownerUserId },
            },
          },
        },
      },
    });
  }

  /**
   * Finds an organization by its ID
   * @param orgId The ID of the organization
   * @param options Optionally require that a certain user is a member of the organization. If requireUser is specified and the organization doesn't contain a matching user, `null` will be returned.
   * @returns The organization
   */
  async getById(
    orgId: number,
    options?: {
      requireUser?: { id: number; permissionLevel?: PermissionLevel };
    },
  ): Promise<Organization | null> {
    const org = await this.client.organization.findUnique({
      where: {
        id: orgId,
        ...(options?.requireUser
          ? {
              users: {
                some: {
                  userId: options.requireUser.id,
                  permissionLevel: options.requireUser.permissionLevel,
                },
              },
            }
          : {}),
      },
    });

    return org;
  }

  /**
   * Claims an unclaimed GitHub App installation by associating it with an organization.
   * @param orgId The ID of the organization to link the installation to
   * @param unassignedInstallationId The ID of the unassigned GitHub App installation
   * @param userId The ID of the user making the request
   * @throws {NotFoundError} with message "installation" or "organization" depending on which record couldn't be found
   */
  async claimInstallation(
    orgId: number,
    unassignedInstallationId: number,
    userId: number,
  ) {
    await this.client.$transaction(async (tx) => {
      let installation: UnassignedInstallation;
      try {
        installation = await tx.unassignedInstallation.delete({
          where: { id: unassignedInstallationId, userId: userId },
        });
      } catch (e) {
        if (e instanceof PrismaClientKnownRequestError && e.code === "P2025") {
          throw new NotFoundError("installation", e);
        }

        throw e;
      }
      try {
        await tx.organization.update({
          where: {
            id: orgId,
            users: { some: { userId: userId, permissionLevel: "OWNER" } },
          },
          data: {
            githubInstallationId: installation.id,
          },
        });
      } catch (e) {
        if (e instanceof PrismaClientKnownRequestError && e.code === "P2025") {
          throw new NotFoundError("organization", e);
        }
        throw e;
      }
    });
  }

  async setTemporaryInstallationId(
    orgId: number,
    userId: number,
    newInstallationId: number,
  ) {
    const org = await this.client.organization.update({
      where: {
        id: orgId,
        users: {
          some: {
            userId: userId,
            permissionLevel: { in: [PermissionLevel.OWNER] },
          },
        },
      },
      data: { newInstallationId: newInstallationId },
    });

    if (!org) {
      throw new NotFoundError("organization");
    }
  }

  async setInstallationId(orgId: number, newInstallationId: number) {
    await this.client.organization.update({
      where: { id: orgId },
      data: {
        newInstallationId: null,
        githubInstallationId: newInstallationId,
      },
    });
  }

  async unlinkInstallationFromAllOrgs(installationId: number) {
    await this.client.$transaction([
      this.client.organization.updateMany({
        where: { githubInstallationId: installationId },
        data: { githubInstallationId: null },
      }),
      this.client.organization.updateMany({
        where: { newInstallationId: installationId },
        data: { newInstallationId: null },
      }),
      this.client.unassignedInstallation.deleteMany({
        where: { installationId: installationId },
      }),
    ]);
  }

  async listUsers(orgId: number): Promise<OrgMembership[]> {
    return (
      await this.client.organization.findUnique({
        where: { id: orgId },
        select: {
          users: {
            include: { organization: true, user: true },
          },
        },
      })
    ).users;
  }

  async delete(orgId: number) {
    await this.client.organization.delete({ where: { id: orgId } });
  }

  async removeMember(orgId: number, userId: number) {
    try {
      await this.client.organizationMembership.delete({
        where: {
          userId_organizationId: {
            userId: userId,
            organizationId: orgId,
          },
        },
      });
    } catch (e) {
      if (e instanceof PrismaClientKnownRequestError && e.code === "P2025") {
        throw new NotFoundError("user");
      }
    }
  }
}
