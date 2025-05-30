import { PrismaClient } from "../generated/prisma/client.ts";

export const db = new PrismaClient({
  datasourceUrl:
    process.env.DATABASE_URL ??
    `postgresql://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOSTNAME}/${process.env.POSTGRES_DB}`,
});
