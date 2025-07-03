import { db } from "./db.ts";

let lastCleanup = 0;

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
      set(key, value, ttl, updateExpiration);
      // (We aren't `await`ing this because it should happen in the background)
    } catch (error) {
      // (Don't rethrow this - it's annoying but shouldn't break things if we can't update the cache)
      console.error("Error updating cached value:", error);
    }
    return value;
  }
  return result;
}

export async function get(key: string): Promise<string | undefined> {
  if (new Date().getTime() - lastCleanup > 60_000) {
    // Remove expired keys up to once every minute
    try {
      db.cache.deleteMany({ where: { expiresAt: { lt: new Date() } } });
      lastCleanup = Date.now();
    } catch (error) {
      console.error("Failed to remove expired cache keys:", error);
    }
  }

  return (
    await db.cache.findUnique({
      where: { key, expiresAt: { lt: new Date() } },
      select: { value: true },
    })
  )?.value;
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

  await db.cache.upsert({
    where: { key },
    create: { key, value, expiresAt },
    update: { key, value, ...(updateExpiration ? { expiresAt } : {}) },
  });
}
