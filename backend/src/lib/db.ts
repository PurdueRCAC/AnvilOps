import crypto, { createCipheriv, createDecipheriv } from "node:crypto";
import "../../prisma/types.ts";
import { Prisma, PrismaClient } from "../generated/prisma/client.ts";
import { type StringFieldUpdateOperationsInput } from "../generated/prisma/internal/prismaNamespace.ts";

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

const patchEnvIfExists = (data: {
  env?: PrismaJson.EnvVar[];
  envKey?: string | StringFieldUpdateOperationsInput;
  [key: string]: unknown;
}) => {
  if (data.env instanceof Array) {
    const key = genKey();
    data.env = data.env.map((envVar) => ({
      ...envVar,
      value: encrypt(envVar.value, key),
    }));
    data.envKey = wrapKey(key);
  }
};

const client = new PrismaClient({
  datasourceUrl: DATABASE_URL,
  omit: {
    deployment: {
      secret: true,
    },
  },
});

export const db = client
  .$extends({
    name: "Decrypt environment variables",
    result: {
      deploymentConfig: {
        displayEnv: {
          needs: { env: true, envKey: true },
          compute(deploymentConfig) {
            if (deploymentConfig.env == null) return [];
            if (!(deploymentConfig.env instanceof Array)) {
              throw new Error("Env must be an array");
            }
            const unwrappedKey = unwrapKey(deploymentConfig.envKey);
            const encrypted = deploymentConfig.env;
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

        getPlaintextEnv: {
          needs: { env: true, envKey: true },
          compute(deploymentConfig) {
            return () => {
              const unwrappedKey = unwrapKey(deploymentConfig.envKey);
              return deploymentConfig.env.map((env) => ({
                ...env,
                value: decrypt(env.value, unwrappedKey),
              }));
            };
          },
        },
      },
    },
  })
  .$extends({
    name: "Encrypt environment variables on write",
    query: {
      app: {
        create({ args, query }) {
          if (!args.data.deploymentConfigTemplate) {
            return query(args);
          }

          const createConfig = args.data.deploymentConfigTemplate.create;
          if (createConfig) {
            patchEnvIfExists(createConfig);
          }
          const connectConfig =
            args.data.deploymentConfigTemplate.connectOrCreate;
          if (connectConfig) {
            patchEnvIfExists(connectConfig.create);
          }
          return query(args);
        },

        update({ args, query }) {
          if (!args.data.deploymentConfigTemplate) {
            return query(args);
          }

          const template = args.data.deploymentConfigTemplate;
          if (template.create) {
            patchEnvIfExists(template.create);
          }

          if (template.connectOrCreate) {
            patchEnvIfExists(template.connectOrCreate.create);
          }

          if (template.upsert) {
            patchEnvIfExists(template.upsert.update);
          }

          if (template.update) {
            patchEnvIfExists(template.update);
          }
        },
      },

      deployment: {
        create({ args, query }) {
          if (!args.data.config) {
            return query(args);
          }
          const createConfig = args.data.config.create;
          if (createConfig && createConfig.env) {
            patchEnvIfExists(createConfig);
          }

          const connectConfig = args.data.config.connectOrCreate;
          if (connectConfig && connectConfig.create.env) {
            patchEnvIfExists(connectConfig.create);
          }

          return query(args);
        },
      },

      // TODO: Disable nested writes to deploymentConfig.env in other app and deployment operations

      deploymentConfig: {
        $allOperations({ operation, args, query }) {
          switch (operation) {
            case "update":
            case "updateMany":
            case "updateManyAndReturn":
            case "create":
              if (args.data.env) {
                patchEnvIfExists(args.data);
              }
              break;
            case "createManyAndReturn":
            case "createMany":
              if (args.data instanceof Array) {
                args.data.forEach((data) => {
                  if (data.env) patchEnvIfExists(data);
                });
              } else {
                if (args.data.env) {
                  patchEnvIfExists(args.data);
                }
              }
              break;
            case "upsert":
              if (args.create.env) {
                patchEnvIfExists(args.create);
              }

              if (args.update.env) {
                patchEnvIfExists(args.update);
              }
              break;
          }

          return query(args);
        },
      },
    },
  });
