import { fieldEncryptionExtension } from "prisma-field-encryption";
import { PrismaClient } from "../generated/prisma/client.ts";

export const DATABASE_URL =
  process.env.DATABASE_URL ??
  `postgresql://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOSTNAME}/${process.env.POSTGRES_DB}`;

export const db = new PrismaClient({
  datasourceUrl: DATABASE_URL,
  omit: {
    deployment: {
      secret: true,
    },
  },
}).$extends(fieldEncryptionExtension());
