import type { AuthenticatedRequest } from "../lib/api.ts";
import { db } from "../lib/db.ts";
import { getNamespace, k8s } from "../lib/kubernetes.ts";
import { json, type HandlerMap } from "../types.ts";

export const listAppPods: HandlerMap["listAppPods"] = async (
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

  const pods = await k8s.default.listNamespacedPod({
    namespace: getNamespace(app.subdomain),
  });

  return json(
    200,
    res,
    pods.items.map((pod) => ({
      name: pod.metadata.name,
      createdAt: pod.metadata.creationTimestamp.toISOString(),
      startedAt: pod.status.startTime.toISOString(),
      deploymentId: parseInt(
        pod.metadata.labels["anvilops.rcac.purdue.edu/deployment-id"],
      ),
      node: pod.spec.nodeName,
      conditions: pod.status.conditions,
      status: pod.status.containerStatuses[0],
    })),
  );
};
