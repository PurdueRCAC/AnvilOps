/* eslint-disable no-console */
import { PgDatabase, type Database } from "../db/index.ts";

const MS_PER_DAY = 86_400_000;
const RETENTION_PERIOD_MS = 14 * MS_PER_DAY;

const db: Database = new PgDatabase(
  process.env.DATABASE_URL ??
    `postgresql://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOSTNAME}/${process.env.POSTGRES_DB}`,
  Buffer.from(process.env.FIELD_ENCRYPTION_KEY, "base64"),
);

/**
 * Deletes logs that have a timestamp of over 14 days ago.
 * This function is run in a CronJob (see charts/anvilops/templates/jobs/rotate-logs.yaml)
 */
async function rotateLogs() {
  const minDate = new Date(Date.now() - RETENTION_PERIOD_MS);
  const result = await db.log.deleteLogsOlderThan(minDate);
  console.log(
    `Deleted ${result.count} log entries older than ${minDate.toLocaleString()}.`,
  );
}

await rotateLogs();
