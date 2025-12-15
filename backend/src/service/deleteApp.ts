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

  if (lastDeployment) {
    const config = await db.deployment.getConfig(lastDeployment.id);

    if (!keepNamespace) {
      try {
        const { KubernetesObjectApi: api } = await getClientsForRequest(
          userId,
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
        userId,
        app.projectId,
        ["KubernetesObjectApi"],
      );
      await createOrUpdateApp(api, app.name, namespace, configs, postCreate);
    }

    // TODO: redeploy without AnvilOps-specified labels
  }

  try {
    if (imageRepo) await deleteRepo(imageRepo);
  } catch (err) {
    console.error("Couldn't delete image repository:", err);
  }

  await db.app.delete(appId);
}
