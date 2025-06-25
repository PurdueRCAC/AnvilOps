import crypto, { createCipheriv, createDecipheriv } from "node:crypto";
import { PrismaClient } from "../generated/prisma/client.ts";

export const DATABASE_URL =
  process.env.DATABASE_URL ??
  `postgresql://${process.env.POSTGRES_USER}:${process.env.POSTGRES_PASSWORD}@${process.env.POSTGRES_HOSTNAME}/${process.env.POSTGRES_DB}`;

const masterKey = Buffer.from(process.env.FIELD_ENCRYPTION_KEY, "base64");
const separator = "|";

const unwrapKey = (wrapped: string): Buffer => {
  const iv = Buffer.alloc(8, 0xa6); // Recommended default initial value
  const decipher = crypto.createDecipheriv("aes256-wrap", masterKey, iv);
  return Buffer.concat([decipher.update(wrapped, "base64"), decipher.final()]);
};

const wrapKey = (key: Buffer): string => {
  const iv = Buffer.alloc(8, 0xa6);
  const cipher = crypto.createCipheriv("aes256-wrap", masterKey, iv);
  return cipher.update(key, undefined, "base64") + cipher.final("base64");
};

const encrypt = (secret: string, key: Buffer): string => {
  const iv = crypto.randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
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
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  return decipher.update(ctxt, undefined, "utf8") + decipher.final("utf8");
};

const genKey = (): Buffer => {
  return crypto.randomBytes(32);
};

const client = new PrismaClient({
  datasourceUrl: DATABASE_URL,
  omit: {
    deployment: {
      secret: true,
    },
  },
});

interface EnvVar {
  name: string;
  value: string;
  isSensitive: boolean;
}

export const db = client
  .$extends({
    name: "Decrypt environment variables",
    result: {
      deploymentConfig: {
        env: {
          needs: { env: true, envKey: true },
          compute(deploymentConfig) {
            if (deploymentConfig.env == null) return [];
            if (!(deploymentConfig.env instanceof Array)) {
              throw new Error("Env must be an array");
            }
            const unwrappedKey = unwrapKey(deploymentConfig.envKey);
            const encrypted = deploymentConfig.env as unknown as EnvVar[]; // TODO: add type guard
            return encrypted.map((env) =>
              env.isSensitive
                ? {
                    ...env,
                    value: null,
                  }
                : {
                    ...env,
                    value: decrypt(env.value, unwrappedKey),
                  },
            );
          },
        },
      },
    },
  })
  .$extends({
    name: "Encrypt environment variables on write",
    query: {
      deploymentConfig: {
        $allOperations({ operation, args, query }) {
          const patch = (data: any) => {
            const key = genKey();
            data.env = data.env.map((envVar) => ({
              ...envVar,
              value: encrypt(envVar.value, key),
            }));
            data.envKey = wrapKey(key);
          };

          switch (operation) {
            case "update":
            case "updateMany":
            case "updateManyAndReturn":
            case "create":
              if (args.data.env) {
                patch(args.data);
              }
              break;
            case "createManyAndReturn":
            case "createMany":
              if (args.data instanceof Array) {
                args.data.forEach((data) => {
                  if (data.env) patch(data);
                });
              } else {
                if (args.data.env) {
                  patch(args.data);
                }
              }
              break;
            case "upsert":
              if (args.create.env) {
                patch(args.create);
              }

              if (args.update.env) {
                patch(args.update);
              }
              break;
          }

          return query(args);
        },
      },
    },
  });
