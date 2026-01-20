import { db } from "../db/index.ts";
import { logger } from "../index.ts";
import { getClientsForRequest } from "../lib/cluster/kubernetes.ts";
import { getNamespace } from "../lib/cluster/resources.ts";
import { AppNotFoundError } from "./common/errors.ts";

export async function deleteAppPod(
  appId: number,
  podName: string,
  userId: number,
) {
  const app = await db.app.getById(appId, {
    requireUser: { id: userId },
  });
  if (!app) {
    throw new AppNotFoundError();
  }

  const { CoreV1Api: api } = await getClientsForRequest(userId, app.projectId, [
    "CoreV1Api",
  ]);

  await api.deleteNamespacedPod({
    namespace: getNamespace(app.namespace),
    name: podName,
  });
  logger.info(
    { podName, namespace: app.namespace, appId, userId },
    "App pod deleted",
  );
}
