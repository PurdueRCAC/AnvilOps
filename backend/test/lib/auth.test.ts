import { randomUUID } from "node:crypto";
import { describe, test } from "vitest";
import { db } from "../../src/db/index.ts";
import type { User } from "../../src/db/models.ts";
import {
  createApp,
  validateAppConfig,
  type NewApp,
} from "../../src/service/createApp.ts";
import { deleteOrgByID } from "../../src/service/deleteOrgByID.ts";

async function getTestUser() {
  const user = await db.user.getByEmail("user@anvilops.local");
  if (!user) {
    return await db.user.createUserWithPersonalOrg(
      "user@anvilops.local",
      "user",
      randomUUID(),
      randomUUID(),
    );
  }
  return user;
}

describe("createApp", async (c) => {
  let user: User, orgId: number;

  c.beforeEach(async () => {
    user = await getTestUser();
    orgId = (await db.user.getOrgs(user.id))[0].organization.id;
  });

  c.afterEach(async () => {
    const orgs = await db.user.getOrgs(user.id);
    for (const entry of orgs) {
      await deleteOrgByID(entry.organization.id, user.id);
    }
    await db.user.deleteById(user.id);
  });

  const create = async (config: NewApp) =>
    createApp(config, await validateAppConfig(user.id, config));

  test("from Docker image", async () => {
    const appId = await create({
      appGroup: { type: "standalone" },
      source: "image",
      imageTag: "nginx:latest",
      cpuCores: 1,
      memoryInMiB: 512,
      createIngress: true,
      env: [],
      mounts: [],
      name: "demo-01",
      orgId,
      port: 80,
      subdomain: "demo-01",
    });

    console.log(appId);
  });
});
