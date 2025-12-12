import { db } from "../db/index.ts";
import type { Organization } from "../db/models.ts";

export async function createOrg(
  name: string,
  firstUserId: number,
): Promise<Organization> {
  return await db.org.create(name, firstUserId);
}
