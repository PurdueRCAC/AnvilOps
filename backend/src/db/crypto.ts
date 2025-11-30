import crypto, { createCipheriv, createDecipheriv } from "node:crypto";
import { env } from "../lib/env.ts";

const masterKey = Buffer.from(env.FIELD_ENCRYPTION_KEY, "base64");
const separator = "|";

const unwrapKey = (wrapped: string): Buffer => {
  const iv = Buffer.alloc(8, 0xa6); // Recommended default initial value
  const decipher = createDecipheriv("aes256-wrap", masterKey, iv);
  return Buffer.concat([decipher.update(wrapped, "base64"), decipher.final()]);
};

const wrapKey = (key: Buffer): string => {
  const iv = Buffer.alloc(8, 0xa6);
  const cipher = createCipheriv("aes256-wrap", masterKey, iv);
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
  const [authTagEncoded, ivEncoded, ctxtEncoded] = ctxtFull.split(separator);
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

export const encryptEnv = (plaintext: PrismaJson.EnvVar[], key: string) => {
  const unwrapped = unwrapKey(key);
  return plaintext.map((envVar) => ({
    ...envVar,
    value: encrypt(envVar.value, unwrapped),
  }));
};

export const decryptEnv = (ciphertext: PrismaJson.EnvVar[], key: string) => {
  const unwrapped = unwrapKey(key);
  return ciphertext.map((envVar) => ({
    ...envVar,
    value: decrypt(envVar.value, unwrapped),
  }));
};

export const generateKey = () => wrapKey(genKey());
