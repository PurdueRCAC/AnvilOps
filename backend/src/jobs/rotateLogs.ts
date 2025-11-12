import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";

const MS_PER_DAY = 86_400_000;
const RETENTION_PERIOD_MS = 14 * MS_PER_DAY;

/**
 * Deletes logs that have a timestamp of over 14 days ago.
 * This function is run in a CronJob (see charts/anvilops/)
 */
async function rotateLogs() {
  const connectionString = `postgresql://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOSTNAME}/${process.env.POSTGRES_DB}`;

  const db = new PrismaClient({
    // Note: We can't import `db` from db.ts because of side effects. db.ts expects some environment variables that aren't present when we run this job.
    adapter: new PrismaPg({ connectionString }),
  });

  const minDate = new Date(Date.now() - RETENTION_PERIOD_MS);
  const result = await db.log.deleteMany({
    where: {
      timestamp: {
        lt: minDate,
      },
    },
  });
  console.log(
    `Deleted ${result.count} log entries older than ${minDate.toLocaleString()}.`,
  );
}

await rotateLogs();
