import { PrismaClientKnownRequestError } from "../../generated/prisma/internal/prismaNamespace.ts";
import { ConflictError, type PrismaClientType } from "../index.ts";
import type { AppGroup } from "../models.ts";

export class AppGroupRepo {
  private client: PrismaClientType;

  constructor(client: PrismaClientType) {
    this.client = client;
  }

  async create(orgId: number, name: string, isMono: boolean) {
    try {
      const group = await this.client.appGroup.create({
        data: {
          orgId: orgId,
          name: name,
          isMono: isMono,
        },
        select: { id: true },
      });

      return group.id;
    } catch (e) {
      if (e instanceof PrismaClientKnownRequestError && e.code === "P2002") {
        // P2002 is "Unique Constraint Failed" - https://www.prisma.io/docs/orm/reference/error-reference#p2002
        throw new ConflictError("name", e);
      }
      throw e;
    }
  }

  async delete(appGroupId: number) {
    if (
      (await this.client.app.count({ where: { appGroupId: appGroupId } })) > 0
    ) {
      throw new Error("App group is not empty");
    }
    await this.client.appGroup.delete({ where: { id: appGroupId } });
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
