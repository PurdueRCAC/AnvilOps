import type { PrismaClientType } from "../index.ts";
import type { RepoImportState } from "../models.ts";

export class RepoImportStateRepo {
  private client: PrismaClientType;
  constructor(client: PrismaClientType) {
    this.client = client;
  }

  async create(
    userId: number,
    orgId: number,
    isOrg: boolean,
    owner: string,
    repo: string,
    makePrivate: boolean,
    sourceURL: string,
  ) {
    const state = await this.client.repoImportState.create({
      data: {
        destRepoOwner: owner,
        destRepoName: repo,
        makePrivate,
        srcRepoURL: sourceURL,
        userId: userId,
        orgId: orgId,
        destIsOrg: isOrg,
      },
      select: { id: true },
    });

    return state.id;
  }

  async get(stateId: string, userId: number): Promise<RepoImportState> {
    const state = await this.client.repoImportState.findUnique({
      where: {
        id: stateId,
        userId: userId,
        createdAt: {
          // Only consider states that were created in the last 5 minutes
          gte: new Date(new Date().getTime() - 5 * 60 * 1000),
        },
      },
    });

    return state;
  }

  async delete(stateId: string) {
    await this.client.repoImportState.delete({ where: { id: stateId } });
  }
}
