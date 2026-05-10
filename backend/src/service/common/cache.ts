import { LRUCache } from "lru-cache";
import type { CacheRepo } from "../../db/repo/cache.ts";
import { logger } from "../../logger.ts";

export class KVCacheService {
  private lastCleanup = 0;

  private localCache = new LRUCache<string, string>({
    max: 1_000,
    maxSize: 1_000,
    sizeCalculation: () => 1,
  });

  private cacheRepo: CacheRepo;

  constructor(cacheRepo: CacheRepo) {
    this.cacheRepo = cacheRepo;
  }

  /**
   * Gets the key's corresponding value from the cache. If it doesn't exist, the mapper function is called and the result is cached for future reference.
   *
   * @param ttl Number of seconds from now or a date to expire the key. Setting to a negative number or a date in the past will result in only retrieving the value and never storing it.
   */
  async getOrCreate(
    key: string,
    ttl: number | Date,
    mapper: () => Promise<string>,
    encrypt: boolean = false,
  ): Promise<string> {
    const result = await this.get(key, encrypt);
    if (typeof result !== "string") {
      const value = await mapper();
      try {
        this.set(key, value, ttl, encrypt).catch((err) => {
          logger.error(err, "Failed to update value in cache");
        });
        // (We aren't `await`ing this because it should happen in the background)
      } catch (error) {
        // (Don't rethrow this - it's annoying but shouldn't break things if we can't update the cache)
        logger.warn(error, "Failed to update cached value");
      }
      return value;
    }
    return result;
  }

  async remove(key: string) {
    await this.cacheRepo.remove(key);
  }

  async get(
    key: string,
    encrypt: boolean = false,
  ): Promise<string | undefined> {
    const localResult = this.localCache.get(key);
    if (localResult) {
      return Promise.resolve(localResult);
    }

    if (new Date().getTime() - this.lastCleanup > 60_000) {
      // Remove expired keys up to once every minute
      this.cacheRepo
        .clean()
        .catch((err) => logger.warn(err, "Failed to clean cache"));
      this.lastCleanup = Date.now();
    }

    try {
      return encrypt
        ? await this.cacheRepo.getEncrypted(key)
        : await this.cacheRepo.get(key);
    } catch (e) {
      logger.warn({ cacheKey: key, error: e }, "Failed to look up cache key");
      return undefined;
    }
  }

  async set(
    key: string,
    value: string,
    ttl: Date | number,
    encrypt: boolean = false,
  ): Promise<void> {
    const expiresAt =
      ttl instanceof Date ? ttl : new Date(new Date().getTime() + ttl * 1000);

    if (expiresAt.getTime() < Date.now()) {
      return; // Don't cache it because it'll expire immediately
    }

    this.localCache.set(key, value, {
      ttl: expiresAt.getTime() - Date.now(),
      noUpdateTTL: true,
    });

    if (encrypt) {
      await this.cacheRepo.setEncrypted(key, value, expiresAt);
    } else {
      await this.cacheRepo.set(key, value, expiresAt);
    }
  }
}
