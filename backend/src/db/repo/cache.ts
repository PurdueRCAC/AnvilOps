import {
  decryptCachedValue,
  encryptCachedValue,
  generateKey,
} from "../crypto.ts";
import type { PrismaClientType } from "../index.ts";

export class CacheRepo {
  private client: PrismaClientType;
  private masterKey: Buffer;

  constructor(client: PrismaClientType, masterKey: Buffer) {
    this.client = client;
    this.masterKey = masterKey;
  }

  async clean() {
    await this.client.cache.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
  }

  async remove(key: string) {
    await this.client.cache.delete({ where: { key } });
  }

  async get(key: string): Promise<string> {
    return (
      await this.client.cache.findUnique({
        where: { key, expiresAt: { gt: new Date() } },
        select: { value: true },
      })
    )?.value;
  }

  async set(key: string, value: string, expiresAt: Date) {
    await this.client.cache.upsert({
      where: { key },
      create: { key, value, expiresAt },
      update: { key, value },
    });
  }

  async getEncrypted(key: string) {
    const row = await this.client.cache.findUnique({
      where: { key, expiresAt: { gt: new Date() } },
    });
    if (!row.encryptionKey) {
      throw new Error("getEncrypted called on a row without an encryption key");
    }
    return decryptCachedValue(this.masterKey, row.value, row.encryptionKey);
  }

  async setEncrypted(cacheKey: string, value: string, expiresAt: Date) {
    const encryptionKey = generateKey(this.masterKey);
    const enc = encryptCachedValue(this.masterKey, value, encryptionKey);
    await this.client.cache.upsert({
      where: { key: cacheKey },
      create: { key: cacheKey, encryptionKey, value: enc, expiresAt },
      update: { key: cacheKey, encryptionKey, value: enc },
    });
  }
}
