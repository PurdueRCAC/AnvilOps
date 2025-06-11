import internals from "@prisma/internals";
import { fieldEncryptionExtension } from "prisma-field-encryption";
import { PrismaClient } from "../generated/prisma/client.ts";

export const DATABASE_URL =
  process.env.DATABASE_URL ??
  `postgresql://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOSTNAME}/${process.env.POSTGRES_DB}`;

const client = new PrismaClient({
  datasourceUrl: DATABASE_URL,
  omit: {
    deployment: {
      secret: true,
    },
  },
});

export const db = client.$extends(
  fieldEncryptionExtension({
    dmmf: await internals.getDMMF({
      datamodel:
        // @ts-expect-error: _engineConfig does not exist in the types
        client._engineConfig.inlineSchema,
    }),
  }),
);
