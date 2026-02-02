import type { AppRepo } from "../db/repo/app.ts";
import { getClientsForRequest } from "../lib/cluster/kubernetes.ts";
import { logger } from "../logger.ts";
import { AppNotFoundError } from "./errors/index.ts";

export class DeleteAppPodService {
  private appRepo: AppRepo;
  constructor(appRepo: AppRepo) {
    this.appRepo = appRepo;
  }

  async deleteAppPod(appId: number, podName: string, userId: number) {
    const app = await this.appRepo.getById(appId, {
      requireUser: { id: userId },
    });
    if (!app) {
      throw new AppNotFoundError();
    }

    const { CoreV1Api: api } = await getClientsForRequest(
      userId,
      app.projectId,
      ["CoreV1Api"],
    );

    await api.deleteNamespacedPod({
      namespace: app.namespace,
      name: podName,
    });
    logger.info(
      { podName, namespace: app.namespace, appId, userId },
      "App pod deleted",
    );
  }
}
