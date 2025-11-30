import { db } from "../db/index.ts";
import {
  deleteNamespace,
  getClientForClusterUsername,
  svcK8s,
} from "../lib/cluster/kubernetes.ts";
import { getNamespace } from "../lib/cluster/resources.ts";
import { env } from "../lib/env.ts";
import { json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const deleteOrgByID: HandlerMap["deleteOrgByID"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  const orgId = ctx.request.params.orgId;
  const org = await db.org.getById(orgId, {
    requireUser: { id: req.user.id, permissionLevel: "OWNER" },
  });

  if (!org) {
    return json(404, res, { code: 404, message: "Organization not found." });
  }

  const user = await db.user.getById(req.user.id);

  const userApi = getClientForClusterUsername(
    user.clusterUsername,
    "KubernetesObjectApi",
    true,
  );

  const apps = await db.app.listForOrg(orgId);

  for (let app of apps) {
    const deployments = await db.app.getDeploymentsWithStatus(app.id, [
      "DEPLOYING",
      "COMPLETE",
      "ERROR",
    ]);

    if (deployments.length > 0) {
      try {
        const api =
          app.projectId === env.SANDBOX_ID
            ? svcK8s["KubernetesObjectApi"]
            : userApi;
        await deleteNamespace(api, getNamespace(app.subdomain));
      } catch (err) {
        console.error(err);
      }
    }

    await db.app.delete(app.id);
  }

  await db.org.delete(orgId);

  return json(200, res, {});
};
