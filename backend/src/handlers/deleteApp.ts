import { db } from "../db/index.ts";
import {
  createOrUpdateApp,
  deleteNamespace,
  getClientsForRequest,
} from "../lib/cluster/kubernetes.ts";
import {
  createAppConfigsFromDeployment,
  getNamespace,
} from "../lib/cluster/resources.ts";
import { deleteRepo } from "../lib/registry.ts";
import { json, type HandlerMap } from "../types.ts";
import { type AuthenticatedRequest } from "./index.ts";

export const deleteApp: HandlerMap["deleteApp"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  const appId = ctx.request.params.appId;

  const app = await db.app.getById(appId);

  // Check permission
  const org = await db.org.getById(app.orgId, {
    requireUser: { id: req.user.id, permissionLevel: "OWNER" },
  });
  if (!org) {
    return json(404, res, { code: 404, message: "App not found" });
  }

  const { namespace, projectId, imageRepo } = app;
  const lastDeployment = await db.app.getMostRecentDeployment(appId);
  const config = await db.deployment.getConfig(lastDeployment.id);

  if (!ctx.request.requestBody.keepNamespace) {
    try {
      const { KubernetesObjectApi: api } = await getClientsForRequest(
        req.user.id,
        projectId,
        ["KubernetesObjectApi"],
      );
      await deleteNamespace(api, getNamespace(namespace));
    } catch (err) {
      console.error("Failed to delete namespace:", err);
    }
  } else if (config.collectLogs) {
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
      req.user.id,
      app.projectId,
      ["KubernetesObjectApi"],
    );
    await createOrUpdateApp(api, app.name, namespace, configs, postCreate);
  }

  try {
    if (imageRepo) await deleteRepo(imageRepo);
  } catch (err) {
    console.error("Couldn't delete image repository:", err);
  }

  try {
    await db.app.delete(appId);
  } catch (err) {
    console.error(err);
    return json(500, res, { code: 500, message: "Failed to delete app" });
  }

  return json(200, res, {});
};
