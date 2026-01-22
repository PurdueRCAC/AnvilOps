import { SpanStatusCode, trace } from "@opentelemetry/api";
import { db } from "../db/index.ts";
import { logger } from "../index.ts";
import {
  createOrUpdateApp,
  deleteNamespace,
  getClientsForRequest,
} from "../lib/cluster/kubernetes.ts";
import { createAppConfigsFromDeployment } from "../lib/cluster/resources.ts";
import { deleteRepo } from "../lib/registry.ts";
import { AppNotFoundError } from "./common/errors.ts";

export async function deleteApp(
  appId: number,
  userId: number,
  keepNamespace: boolean,
) {
  const app = await db.app.getById(appId);

  // Check permission
  const org = await db.org.getById(app.orgId, {
    requireUser: { id: userId, permissionLevel: "OWNER" },
  });
  if (!org) {
    throw new AppNotFoundError();
  }

  const { namespace, projectId, imageRepo } = app;
  const lastDeployment = await db.app.getMostRecentDeployment(appId);
  const config = await db.deployment.getConfig(lastDeployment.id);

  if (!keepNamespace) {
    const { KubernetesObjectApi: api } = await getClientsForRequest(
      userId,
      projectId,
      ["KubernetesObjectApi"],
    );
    try {
      await deleteNamespace(api, namespace);
    } catch (err) {
      logger.warn({ namespace }, "Failed to delete namespace");
      const span = trace.getActiveSpan();
      span?.recordException(err as Error);
      span?.setStatus({
        code: SpanStatusCode.ERROR,
        message: "Failed to delete namespace",
      });
    }
  } else if (config.appType === "workload" && config.collectLogs) {
    // If the log shipper was enabled, redeploy without it
    config.collectLogs = false; // <-- Disable log shipping

    const app = await db.app.getById(lastDeployment.appId);
    const [org, appGroup] = await Promise.all([
      db.org.getById(app.orgId),
      db.appGroup.getById(app.appGroupId),
    ]);

    const { namespace, configs, postCreate } =
      await createAppConfigsFromDeployment(
        org,
        app,
        appGroup,
        lastDeployment,
        config,
      );

    const { KubernetesObjectApi: api } = await getClientsForRequest(
      userId,
      app.projectId,
      ["KubernetesObjectApi"],
    );
    await createOrUpdateApp(api, app.name, namespace, configs, postCreate);
  }

  // TODO: redeploy without AnvilOps-specified labels

  try {
    if (imageRepo) await deleteRepo(imageRepo);
  } catch (err) {
    logger.warn({ imageRepo }, "Failed to delete image repository");
    const span = trace.getActiveSpan();
    span?.recordException(err as Error);
    span?.setStatus({
      code: SpanStatusCode.ERROR,
      message: "Failed to delete image repository",
    });
  }

  await db.app.delete(appId);
  logger.info(
    { appId, userId, imageRepo, namespace, keepNamespace },
    "App deleted",
  );
}
