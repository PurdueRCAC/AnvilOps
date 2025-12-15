import { randomUUID } from "node:crypto";
import { db } from "../../src/db/index.ts";

export async function getTestUser() {
  const user = await db.user.getByEmail("user@anvilops.local");
  if (!user) {
    return await db.user.createUserWithPersonalOrg(
      "user@anvilops.local",
      "user",
      randomUUID(),
      null,
    );
  }
  return user;
}

export function getTestNamespace() {
  return crypto.randomUUID().substring(0, 8);
}
