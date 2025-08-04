import type { AuthenticatedRequest } from "./index.ts";
import { db } from "../lib/db.ts";
import { getNamespace } from "../lib/cluster/resources.ts";
import { json, type HandlerMap } from "../types.ts";
import { getClientsForRequest } from "../lib/cluster/kubernetes.ts";

export const deleteAppPod: HandlerMap["deleteAppPod"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  const app = await db.app.findFirst({
    where: {
      id: ctx.request.params.appId,
      org: { users: { some: { userId: req.user.id } } },
    },
  });
  if (!app) {
    return json(404, res, {});
  }

  const { CoreV1Api: api } = await getClientsForRequest(
    req.user.id,
    app.projectId,
    ["CoreV1Api"],
  );

  await api.deleteNamespacedPod({
    namespace: getNamespace(app.subdomain),
    name: ctx.request.params.podName,
  });

  return json(204, res, {});
};
