import { randomUUID } from "node:crypto";
import { db } from "../../src/db/index.ts";

let userCounter = 0;
let nsCounter = 0;

const prefix = new Date().getTime().toString() + "-";

export async function getTestUser() {
  const user = await db.user.getByEmail("user@anvilops.local");
  if (!user) {
    const name = `${prefix}user-${userCounter++}`;
    return await db.user.createUserWithPersonalOrg(
      `${name}@anvilops.local`,
      name,
      randomUUID(),
      null,
    );
  }
  return user;
}

export function getTestNamespace() {
  return `${prefix}ns-${nsCounter++}`;
}
