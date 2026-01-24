import { LRUCache } from "lru-cache";
import { db } from "../db/index.ts";
import { logger } from "../index.ts";

let lastCleanup = 0;

const localCache = new LRUCache<string, string>({
  max: 1_000,
  maxSize: 1_000,
  sizeCalculation: () => 1,
});

/**
 * Gets the key's corresponding value from the cache. If it doesn't exist, the mapper function is called and the result is cached for future reference.
 *
 * @param ttl Number of seconds from now or a date to expire the key. Setting to a negative number or a date in the past will result in only retrieving the value and never storing it.
 */
export async function getOrCreate(
  key: string,
  ttl: number | Date,
  mapper: () => Promise<string>,
  updateExpiration: boolean = false,
): Promise<string> {
  const result = await get(key);
  if (typeof result !== "string") {
    const value = await mapper();
    try {
      set(key, value, ttl, updateExpiration).catch((err) => {
        throw err;
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

export async function get(key: string): Promise<string | undefined> {
  const localResult = localCache.get(key);
  if (localResult) {
    return Promise.resolve(localResult);
  }

  if (new Date().getTime() - lastCleanup > 60_000) {
    // Remove expired keys up to once every minute
    db.cache.clean().catch((err) => logger.warn(err, "Failed to clean cache"));
    lastCleanup = Date.now();
  }

  try {
    return await db.cache.get(key);
  } catch (e) {
    logger.warn({ cacheKey: key, error: e }, "Failed to look up cache key");
    return undefined;
  }
}

export async function set(
  key: string,
  value: string,
  ttl: Date | number,
  updateExpiration: boolean = false,
): Promise<void> {
  const expiresAt =
    ttl instanceof Date ? ttl : new Date(new Date().getTime() + ttl * 1000);

  if (expiresAt.getTime() < Date.now()) {
    return; // Don't cache it because it'll expire immediately
  }

  localCache.set(key, value, {
    ttl: expiresAt.getTime() - Date.now(),
    noUpdateTTL: !updateExpiration,
  });

  await db.cache.set(key, value, updateExpiration ? expiresAt : undefined);
}
