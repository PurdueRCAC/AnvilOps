import type { V1Pod } from "@kubernetes/client-node";
import type { AuthenticatedRequest } from "../lib/api.ts";
import { db } from "../lib/db.ts";
import { k8s } from "../lib/kubernetes.ts";
import { json, type HandlerMap } from "../types.ts";

export const getAppLogs: HandlerMap["getAppLogs"] = async (
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

  if (app === null) {
    return json(404, res, {});
  }

  const namespace = app.subdomain;

  const pods = await k8s.default.listNamespacedPod({
    namespace,
    labelSelector: `anvilops.rcac.purdue.edu/app-id=${app.id}`,
  });

  if (!pods || pods.items.length === 0) {
    return json(200, res, { available: false, logs: "" });
  }

  let mostRecentPod: V1Pod = pods.items[0];

  for (const pod of pods.items) {
    if (
      new Date(pod.status.startTime).getTime() >
      new Date(mostRecentPod.status.startTime).getTime()
    ) {
      mostRecentPod = pod;
    }
  }

  const logs = await k8s.default.readNamespacedPodLog({
    namespace,
    name: mostRecentPod.metadata.name,
  });

  return json(200, res, { available: true, logs });
};
