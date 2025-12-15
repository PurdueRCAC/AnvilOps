import {
  PermissionLevel,
  type GitHubOAuthAction,
} from "../../generated/prisma/enums.ts";
import { NotFoundError, type PrismaClientType } from "../index.ts";
import type { OrgMembership, UnassignedInstallation, User } from "../models.ts";

export class UserRepo {
  private client: PrismaClientType;

  constructor(client: PrismaClientType) {
    this.client = client;
  }

  async getById(userId: number): Promise<User | null> {
    return await this.client.user.findUnique({ where: { id: userId } });
  }

  async getByEmail(email: string): Promise<User | null> {
    return await this.client.user.findUnique({
      where: { email: email.toLowerCase() },
    });
  }

  async getByCILogonUserId(ciLogonUserId: string): Promise<User | null> {
    return await this.client.user.findUnique({
      where: { ciLogonUserId },
    });
  }

  async createUserWithPersonalOrg(
    email: string,
    name: string,
    ciLogonUserId: string,
    clusterUsername: string,
  ): Promise<User> {
    return await this.client.user.create({
      data: {
        email: email.toLowerCase(),
        name,
        ciLogonUserId,
        clusterUsername,
        orgs: {
          create: {
            permissionLevel: PermissionLevel.OWNER,
            organization: {
              create: {
                name: `${name || email || ciLogonUserId}'s Apps`,
              },
            },
          },
        },
      },
    });
  }

  async getOrgs(userId: number): Promise<OrgMembership[]> {
    return (
      await this.client.user.findUnique({
        where: { id: userId },
        include: { orgs: { include: { organization: true, user: true } } },
      })
    ).orgs;
  }

  async getUnassignedInstallations(
    userId: number,
  ): Promise<UnassignedInstallation[]> {
    return (
      await this.client.user.findUnique({
        where: { id: userId },
        include: { unassignedInstallations: true },
      })
    ).unassignedInstallations;
  }

  async setOAuthState(
    orgId: number,
    userId: number,
    action: GitHubOAuthAction,
    random: string,
  ): Promise<void> {
    // deleteMany does not throw if there is no state for the user
    await this.client.gitHubOAuthState.deleteMany({
      where: { userId: userId },
    });

    const affectedUser = await this.client.user.update({
      where: { id: userId },
      data: {
        githubOAuthState: {
          create: { action, orgId, random },
        },
      },
    });

    if (affectedUser == null) {
      throw new NotFoundError("user");
    }
  }

  async getAndDeleteOAuthState(random: string) {
    const state = await this.client.gitHubOAuthState.delete({
      where: {
        random: random,
      },
      include: { user: true },
    });

    if (state === null) {
      throw new NotFoundError("user");
    }

    return state;
  }

  async setGitHubUserId(userId: number, githubUserId: number) {
    await this.client.user.updateMany({
      // Remove the association to this GitHub user ID for any other AnvilOps users - this is OK to do because we're only using the user ID as a way to temporarily
      // link the installation webhook payloads to the AnvilOps user account. If a user creates multiple AnvilOps accounts and signs in with GitHub on all of them,
      // it's fine that the installation request is only associated with their most recently connected account.
      where: { githubUserId: githubUserId, id: { not: userId } },
      data: { githubUserId: null },
    });
    await this.client.user.update({
      where: { id: userId },
      data: { githubUserId: githubUserId },
    });
  }

  async createUnassignedInstallation(
    githubUserId: number,
    installationId: number,
    targetName: string,
    url: string,
  ) {
    const user = await this.client.user.findFirst({
      where: { githubUserId: githubUserId },
    });
    if (user === null) {
      throw new NotFoundError("user");
    }

    await this.client.unassignedInstallation.create({
      data: {
        userId: user.id,
        installationId,
        targetName,
        url,
      },
    });
  }

  async deleteById(userId: number) {
    await this.client.user.delete({ where: { id: userId } });
  }
}
