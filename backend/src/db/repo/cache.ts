import type { PrismaClientType } from "../index.ts";

export class CacheRepo {
  private client: PrismaClientType;

  constructor(client: PrismaClientType) {
    this.client = client;
  }

  async clean() {
    await this.client.cache.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
  }

  async get(key: string): Promise<string> {
    return (
      await this.client.cache.findUnique({
        where: { key, expiresAt: { gt: new Date() } },
        select: { value: true },
      })
    )?.value;
  }

  async set(key: string, value: string, expiresAt: Date | undefined) {
    this.client.cache.upsert({
      where: { key },
      create: { key, value, expiresAt },
      update: { key, value, ...(expiresAt !== undefined ? { expiresAt } : {}) },
    });
  }
}
