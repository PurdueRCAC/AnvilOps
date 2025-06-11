import { PrismaClient } from "../generated/prisma/client.ts";
import crypto, { createCipheriv, createDecipheriv } from "node:crypto";
import { type StringFieldUpdateOperationsInput } from "../generated/prisma/models.ts";

export const DATABASE_URL =
  process.env.DATABASE_URL ??
  `postgresql://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOSTNAME}/${process.env.POSTGRES_DB}`;

const masterKey = Buffer.from(process.env.FIELD_ENCRYPTION_KEY, "base64");
const algorithm = "aes-256-gcm";
const separator = "|";

export const encryptKey = (key: Buffer) => {
  const iv = crypto.randomBytes(12);
  const cipher = createCipheriv(algorithm, masterKey, iv);
  const res = Buffer.concat([cipher.update(key), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [authTag, iv, res]
    .map((buf) => buf.toString("base64"))
    .join(separator);
};

const decryptKey = (keyCtxt: string | StringFieldUpdateOperationsInput) => {
  const key = typeof keyCtxt === "string" ? keyCtxt : keyCtxt.set;
  const [authTagEncoded, ivEncoded, ctxtEncoded] = key.split("|");
  const iv = Buffer.from(ivEncoded, "base64");
  const ctxt = Buffer.from(ctxtEncoded, "base64");
  const authTag = Buffer.from(authTagEncoded, "base64");
  const decipher = createDecipheriv(algorithm, masterKey, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ctxt), decipher.final()]);
};

const encrypt = (
  text: string,
  keyCtxt: string | StringFieldUpdateOperationsInput,
) => {
  const iv = crypto.randomBytes(12);
  const key = decryptKey(keyCtxt);
  const cipher = createCipheriv(algorithm, key, iv);
  const res = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [authTag, iv, res].map((buf) => buf.toString("base64")).join("|");
};

const decrypt = (secret: string, keyCtxt: string) => {
  const [authTagEncoded, ivEncoded, ctxtEncoded] = secret.split("|");
  const authTag = Buffer.from(authTagEncoded, "base64");
  const iv = Buffer.from(ivEncoded, "base64");
  const key = decryptKey(keyCtxt);
  const decipher = createDecipheriv(algorithm, key, iv);
  decipher.setAuthTag(authTag);
  const res =
    decipher.update(ctxtEncoded, "base64", "utf8") + decipher.final("utf8");
  return res;
};

const client = new PrismaClient({
  datasourceUrl: DATABASE_URL,
  omit: {
    deployment: {
      secret: true,
    },
    app: {
      secretKeyCtxt: true,
    },
  },
});

export const db = client.$extends({
  name: "Secret encryption and decryption",
  result: {
    app: {
      secrets: {
        needs: { secrets: true, secretKeyCtxt: true },
        compute(app) {
          try {
            return decrypt(app.secrets, app.secretKeyCtxt);
          } catch (err) {
            console.error(err);
            return "";
          }
        },
      },
    },
  },

  query: {
    app: {
      async $allOperations({ operation, args, query }) {
        switch (operation) {
          case "update":
          case "updateMany":
          case "updateManyAndReturn":
          case "create":
            args.data.secretKeyCtxt = encryptKey(crypto.randomBytes(32));

            if (args.data.secrets) {
              if (typeof args.data.secrets === "string") {
                args.data.secrets = encrypt(
                  args.data.secrets,
                  args.data.secretKeyCtxt,
                );
              } else if (args.data.secrets.set === "string") {
                args.data.secrets.set = encrypt(
                  args.data.secrets.set,
                  args.data.secretKeyCtxt,
                );
              }
            }
            break;
          case "createManyAndReturn":
          case "createMany":
            if (args.data instanceof Array) {
              args.data.forEach((data) => {
                data.secretKeyCtxt = encryptKey(crypto.randomBytes(32));

                if (!data.secrets) return;
                data.secrets = encrypt(data.secrets, data.secretKeyCtxt);
              });
            } else {
              args.data.secretKeyCtxt = encryptKey(crypto.randomBytes(32));

              if (args.data.secrets) {
                args.data.secrets = encrypt(
                  args.data.secrets,
                  args.data.secretKeyCtxt,
                );
              }
            }
            break;
          case "upsert":
            args.create.secretKeyCtxt = encryptKey(crypto.randomBytes(32));

            if (args.create.secrets) {
              args.create.secrets = encrypt(
                args.create.secrets,
                args.create.secretKeyCtxt,
              );
            }

            if (typeof args.update.secrets === "string") {
              args.update.secrets = encrypt(
                args.update.secrets,
                args.update.secretKeyCtxt,
              );
            } else if (typeof args.update.secrets.set === "string") {
              args.update.secrets.set = encrypt(
                args.update.secrets.set,
                args.update.secretKeyCtxt,
              );
            }
            break;
        }

        return query(args);
      },
    },
  },
});
