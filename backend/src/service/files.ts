import type { AppRepo } from "../db/repo/app.ts";
import { generateVolumeName } from "../lib/cluster/resources/statefulset.ts";
import { forwardRequest } from "../lib/fileBrowser.ts";
import {
  AppNotFoundError,
  IllegalPVCAccessError,
  ValidationError,
} from "./errors/index.ts";

export class FileBrowserService {
  private appRepo: AppRepo;

  constructor(appRepo: AppRepo) {
    this.appRepo = appRepo;
  }

  async forwardToFileBrowser(
    userId: number,
    appId: number,
    volumeClaimName: string,
    path: string,
    requestInit: RequestInit,
  ) {
    const app = await this.appRepo.getById(appId, {
      requireUser: { id: userId },
    });

    if (!app) {
      throw new AppNotFoundError();
    }

    const config = await this.appRepo.getDeploymentConfig(appId);

    if (config.appType !== "workload") {
      throw new ValidationError(
        "File browsing is supported only for Git and image deployments",
      );
    }

    if (
      !config.mounts.some((mount) =>
        volumeClaimName.startsWith(generateVolumeName(mount.path) + "-"),
      )
    ) {
      // This persistent volume doesn't belong to the application
      throw new IllegalPVCAccessError();
    }

    const response = await forwardRequest(
      app.namespace,
      volumeClaimName,
      path,
      requestInit,
    );

    return response;
  }
}
