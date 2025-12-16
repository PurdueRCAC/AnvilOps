import type { PrismaClientType } from "../index.ts";
import type { AppGroup } from "../models.ts";

export class AppGroupRepo {
  private client: PrismaClientType;

  constructor(client: PrismaClientType) {
    this.client = client;
  }

  async create(orgId: number, name: string, isMono: boolean) {
    const group = await this.client.appGroup.create({
      data: {
        orgId: orgId,
        name: name,
        isMono: isMono,
      },
      select: { id: true },
    });

    return group.id;
  }

  async getById(appGroupId: number): Promise<AppGroup> {
    return await this.client.appGroup.findUnique({
      where: { id: appGroupId },
    });
  }

  async listForOrg(orgId: number): Promise<AppGroup[]> {
    return await this.client.appGroup.findMany({
      where: { orgId: orgId },
    });
  }
}
