import { db } from "../db/index.ts";
import { getNamespace } from "../lib/cluster/resources.ts";
import { generateVolumeName } from "../lib/cluster/resources/statefulset.ts";
import { forwardRequest } from "../lib/fileBrowser.ts";
import { AppNotFoundError, IllegalPVCAccessError } from "./common/errors.ts";

export async function forwardToFileBrowser(
  userId: number,
  appId: number,
  volumeClaimName: string,
  path: string,
  requestInit: RequestInit,
) {
  const app = await db.app.getById(appId, { requireUser: { id: userId } });

  if (!app) {
    throw new AppNotFoundError();
  }

  const config = await db.app.getDeploymentConfig(appId);

  if (
    !config.mounts.some((mount) =>
      volumeClaimName.startsWith(generateVolumeName(mount.path) + "-"),
    )
  ) {
    // This persistent volume doesn't belong to the application
    throw new IllegalPVCAccessError();
  }

  const response = await forwardRequest(
    getNamespace(app.namespace),
    volumeClaimName,
    path,
    requestInit,
  );

  return response;
}
