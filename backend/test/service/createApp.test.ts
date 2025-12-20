import {
  ApiException,
  AppsV1Api,
  KubeConfig,
  type ApiConstructor,
} from "@kubernetes/client-node";
import { setTimeout } from "node:timers/promises";
import { describe, expect, test } from "vitest";
import { db } from "../../src/db/index.ts";
import type { User } from "../../src/db/models.ts";
import { DeploymentStatus } from "../../src/generated/prisma/enums.ts";
import { getNamespace } from "../../src/lib/cluster/resources.ts";
import {
  createApp,
  validateAppConfig,
  type NewApp,
} from "../../src/service/createApp.ts";
import { deleteOrgByID } from "../../src/service/deleteOrgByID.ts";
import { getAppByID } from "../../src/service/getAppByID.ts";
import { getTestNamespace, getTestUser } from "../fixtures/user.ts";

const kc = new KubeConfig();
kc.loadFromDefault();

async function waitForCreate<T, C>(
  clientType: ApiConstructor<C>,
  check: (client: C) => Promise<T>,
): Promise<T> {
  let last404Error: ApiException<unknown>;
  const client = kc.makeApiClient(clientType);
  for (let i = 0; i < 20; i++) {
    try {
      return await check(client);
    } catch (e) {
      if (e instanceof ApiException && e.code === 404) {
        // Not found; continue waiting
        last404Error = e;
        await setTimeout(500);
      } else {
        throw e;
      }
    }
  }

  throw new Error("Timed out waiting for resource", { cause: last404Error });
}

async function waitForStatusCode(url: string, code: number) {
  let lastError: Error;
  for (let i = 0; i < 20; i++) {
    try {
      const response = await fetch(url);
      if (response.status === code) {
        return response;
      }
    } catch (e) {
      lastError = e;
    }
    await setTimeout(500);
  }
  throw new Error("Timed out waiting for HTTP status", { cause: lastError });
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
    const config = {
      appGroup: { type: "standalone" },
      source: "image",
      imageTag: process.env.TEST_ANVILOPS_SAMPLE_IMAGE,
      cpuCores: 1,
      memoryInMiB: 512,
      createIngress: true,
      env: [],
      mounts: [],
      name: "test-app",
      orgId,
      port: 8080,
      subdomain: getTestNamespace(),
    } satisfies NewApp;

    const appId = await create(config);
    const app = await getAppByID(appId, user.id);
    const ns = getNamespace(app.namespace);

    const sts = await waitForCreate(AppsV1Api, (c) =>
      c.readNamespacedStatefulSet({
        namespace: ns,
        name: app.name,
      }),
    );

    const deployment = await db.app.getMostRecentDeployment(app.id);

    expect(deployment.status).toEqual(DeploymentStatus.COMPLETE);

    expect(sts.spec.template.metadata.labels).toEqual({
      "anvilops.rcac.purdue.edu/app-group-id": app.appGroup.id.toString(),
      "anvilops.rcac.purdue.edu/app-id": app.id.toString(),
      "anvilops.rcac.purdue.edu/deployment-id": deployment.id.toString(),
      "app.kubernetes.io/managed-by": "anvilops",
      "app.kubernetes.io/name": app.name,
      "app.kubernetes.io/part-of": `${app.appGroup.name}-${app.appGroup.id}-${app.orgId}`,
      app: app.name,
    });

    expect(sts.spec.template.spec.containers[0].image).toEqual(config.imageTag);

    const clusterInternalURL = `http://${ns}.${ns}.svc.cluster.local`;

    const response = await waitForStatusCode(clusterInternalURL, 200);
    expect(await response.text()).toEqual("Hello, world!\n");
  }, /* timeout = */ 60_000);

  // test("from Dockerfile", () => {
  //   assert.fail("Not implemented yet");
  // });

  // test("from Railpack", () => {
  //   assert.fail("Not implemented yet");
  // });
});
