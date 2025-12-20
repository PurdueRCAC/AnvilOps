import { assert, describe, test } from "vitest";
import { db } from "../../src/db/index.ts";
import type { User } from "../../src/db/models.ts";
import {
  createApp,
  validateAppConfig,
  type NewApp,
} from "../../src/service/createApp.ts";
import { deleteOrgByID } from "../../src/service/deleteOrgByID.ts";
import { getTestNamespace, getTestUser } from "../fixtures/user.ts";

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
      imageTag: process.env.TEST_ANVILOPS_SAMPLE_IMAGE,
      cpuCores: 1,
      memoryInMiB: 512,
      createIngress: false,
      env: [],
      mounts: [],
      name: "test-app",
      orgId,
      port: 80,
      subdomain: getTestNamespace(),
    });

    test("from Dockerfile", () => {
      assert.fail("Not implemented yet");
    });

    test("from Railpack", () => {
      assert.fail("Not implemented yet");
    });

    console.log(appId);
  });
});
