import { PGlite } from "@electric-sql/pglite";
import { randomBytes } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { Notification } from "pg";
import { PrismaPGlite } from "pglite-prisma-adapter";
import {
  PrismaDatabase,
  type Database,
  type PrismaClientType,
} from "../../src/db/index.ts";
import { PrismaClient } from "../../src/generated/prisma/client.ts";

class PgliteDatabase extends PrismaDatabase {
  private pglite: PGlite;

  constructor(client: PGlite) {
    const adapter = new PrismaPGlite(client);
    const db = new PrismaClient({ adapter }) satisfies PrismaClientType;
    super(db, randomBytes(32).toString("base64"));
    this.pglite = client;
  }

  override async subscribe(
    channel: string,
    callback: (msg: Notification) => void,
  ): Promise<() => Promise<void>> {
    return await this.pglite.listen(channel, (payload) =>
      callback({ processId: -1, channel, payload }),
    );
  }

  override async publish(channel: string, payload: string): Promise<void> {
    await this.pglite.query("SELECT pg_notify($1, $2);", [channel, payload]);
  }
}

/**
 * Returns a Prisma Client that points to a new, in-memory PGlite database.
 * Changes to this database won't affect any other databases returned from previous calls to this function.
 */
export async function createDB(): Promise<Database> {
  // https://makerkit.dev/blog/tutorials/unit-testing-prisma-vitest
  const client = new PGlite();

  const migrationsDir = join(
    import.meta.dirname,
    "..",
    "..",
    "prisma",
    "migrations",
  );
  const entries = await readdir(migrationsDir);

  for (const entry of entries) {
    /* eslint-disable no-await-in-loop */
    if (!(await stat(join(migrationsDir, entry))).isDirectory()) continue;

    const migration = join(migrationsDir, entry, "migration.sql");
    const sql = await readFile(migration, "utf-8");
    await client.exec(sql);
    /* eslint-enable no-await-in-loop */
  }

  return new PgliteDatabase(client);
}
