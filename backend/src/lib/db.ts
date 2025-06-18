import crypto, { createCipheriv, createDecipheriv } from "node:crypto";
import { PrismaClient } from "../generated/prisma/client.ts";

export const DATABASE_URL =
  process.env.DATABASE_URL ??
  `postgresql://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOSTNAME}/${process.env.POSTGRES_DB}`;

const masterKey = Buffer.from(process.env.FIELD_ENCRYPTION_KEY, "base64");
const algorithm = "aes-256-gcm";
const separator = "|";
const contentSeparator = "$";

const encrypt = (secret: string, key: Buffer): string => {
  const iv = crypto.randomBytes(12);
  const cipher = createCipheriv(algorithm, key, iv);
  const res = Buffer.concat([cipher.update(secret), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [authTag, iv, res]
    .map((buf) => buf.toString("base64"))
    .join(separator);
};

const decrypt = (ctxtFull: string, key: Buffer): string => {
  const [authTagEncoded, ivEncoded, ctxtEncoded] = ctxtFull.split("|");
  const iv = Buffer.from(ivEncoded, "base64");
  const ctxt = Buffer.from(ctxtEncoded, "base64");
  const authTag = Buffer.from(authTagEncoded, "base64");
  const decipher = createDecipheriv(algorithm, key, iv);
  decipher.setAuthTag(authTag);

  return decipher.update(ctxt, undefined, "utf8") + decipher.final("utf8");
};

const genKey = (): Buffer => {
  return crypto.randomBytes(32);
};

const encryptSecret = (secret: string): string => {
  const key = genKey();
  const enc = encrypt(secret, key);
  const keyCtxt = encrypt(key.toString("base64"), masterKey);
  return keyCtxt + contentSeparator + enc;
};

const decryptSecret = (secret: string): string => {
  const [keyCtxt, enc] = secret.split(contentSeparator);
  const keyEncoded = decrypt(keyCtxt, masterKey);
  const key = Buffer.from(keyEncoded, "base64");
  return decrypt(enc, key);
};

const client = new PrismaClient({
  datasourceUrl: DATABASE_URL,
  omit: {
    deployment: {
      secret: true,
    },
  },
});

export const db = client.$extends({
  name: "Secret encryption and decryption",
  result: {
    deploymentConfig: {
      secrets: {
        needs: { secrets: true },
        compute(dc) {
          try {
            if (!dc.secrets) {
              return "[]";
            }
            return decryptSecret(dc.secrets);
          } catch (err) {
            console.error(err);
            return "[]";
          }
        },
      },
    },
  },

  query: {
    deployment: {
      async create({ args, query }) {
        if (!args.data.config) {
          return query(args);
        }

        const createConfig = args.data.config.create;
        if (createConfig && createConfig.secrets) {
          createConfig.secrets = encryptSecret(createConfig.secrets);
        }

        const connectConfig = args.data.config.connectOrCreate;
        if (connectConfig && connectConfig.create.secrets) {
          connectConfig.create.secrets = encryptSecret(
            connectConfig.create.secrets,
          );
        }

        return query(args);
      },
    },

    deploymentConfig: {
      async $allOperations({ operation, args, query }) {
        switch (operation) {
          case "update":
          case "updateMany":
          case "updateManyAndReturn":
          case "create":
            if (args.data.secrets) {
              if (typeof args.data.secrets === "string") {
                args.data.secrets = encryptSecret(args.data.secrets);
              } else if (args.data.secrets.set === "string") {
                args.data.secrets.set = encryptSecret(args.data.secrets.set);
              }
            }
            break;
          case "createManyAndReturn":
          case "createMany":
            if (args.data instanceof Array) {
              args.data.forEach((data) => {
                if (!data.secrets) return;
                data.secrets = encryptSecret(data.secrets);
              });
            } else {
              if (args.data.secrets) {
                args.data.secrets = encryptSecret(args.data.secrets);
              }
            }
            break;
          case "upsert":
            if (args.create.secrets) {
              args.create.secrets = encryptSecret(args.create.secrets);
            }

            if (typeof args.update.secrets === "string") {
              args.update.secrets = encryptSecret(args.update.secrets);
            } else if (typeof args.update.secrets.set === "string") {
              args.update.secrets.set = encryptSecret(args.update.secrets.set);
            }
            break;
        }

        return query(args);
      },
    },
  },
});
