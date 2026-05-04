import type {
  DomainVerificationStatus,
  PermissionLevel,
} from "../../generated/prisma/enums.ts";
import type { PrismaClientType } from "../index.ts";

export class DomainRepo {
  private client: PrismaClientType;

  constructor(client: PrismaClientType) {
    this.client = client;
  }

  async create(appId: number, domainName: string) {
    await this.client.domain.create({
      data: {
        appId,
        name: domainName,
      },
    });
  }

  async getById(
    domainId: number,
    options?: {
      requireUser?: { id: number; permissionLevel?: PermissionLevel };
    },
  ) {
    return await this.client.domain.findUnique({
      where: {
        id: domainId,
        ...(options?.requireUser
          ? {
              app: {
                org: {
                  users: {
                    some: {
                      userId: options.requireUser.id,
                      permissionLevel: options.requireUser.permissionLevel,
                    },
                  },
                },
              },
            }
          : {}),
      },
    });
  }

  async getByToken(token: string) {
    return await this.client.domain.findUnique({ where: { token } });
  }

  async getByName(domainName: string) {
    return await this.client.domain.findMany({ where: { name: domainName } });
  }

  async listByAppId(
    appId: number,
    options?: {
      requireUser?: { id: number; permissionLevel?: PermissionLevel };
    },
  ) {
    return await this.client.domain.findMany({
      where: {
        appId,
        ...(options?.requireUser
          ? {
              app: {
                org: {
                  users: {
                    some: {
                      userId: options.requireUser.id,
                      permissionLevel: options.requireUser.permissionLevel,
                    },
                  },
                },
              },
            }
          : {}),
      },
    });
  }

  async updateCertOrderDetails(
    domainId: number,
    challengeToken: string,
    keyAuthorization: string,
    orderURL: string,
  ) {
    await this.client.domain.update({
      where: { id: domainId },
      data: {
        token: challengeToken,
        keyAuthorization,
        orderURL,
      },
    });
  }

  async setStatus(domainId: number, status: DomainVerificationStatus) {
    await this.client.domain.update({
      where: { id: domainId },
      data: { status },
    });
  }

  async markAsGenerated(domainId: number, notBefore: Date, notAfter: Date) {
    await this.client.domain.update({
      where: { id: domainId },
      data: {
        token: null,
        keyAuthorization: null,
        orderURL: null,
        status: "GENERATED",
        certIssuedAt: notBefore,
        certExpiresAt: notAfter,
      },
    });
  }

  /**
   * Returns verified domains that have certificates that have less than 1/3 of their validity window remaining.
   * These certificates should be renewed soon.
   */
  async listUpForRenewal() {
    const maxDate = new Date(new Date().getTime() + 1000 * 60 * 60 * 24 * 7); // 7 days from now
    const domains = await this.client.domain.findMany({
      where: {
        status: { in: ["ERROR", "GENERATED", "PENDING", "GENERATING"] },
        certExpiresAt: { lt: maxDate },
      },
    });
    return domains.filter((it) => {
      const iss = it.certIssuedAt.getTime();
      const exp = it.certExpiresAt.getTime();
      return (exp - new Date().getTime()) / (exp - iss) <= 0.333;
    });
  }
}
