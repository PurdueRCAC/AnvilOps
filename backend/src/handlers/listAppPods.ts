import type {
  ApiException,
  V1PodCondition,
  V1PodList,
} from "@kubernetes/client-node";
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

  let pods: V1PodList;
  try {
    pods = await k8s.default.listNamespacedPod({
      namespace: getNamespace(app.subdomain),
    });
  } catch (e) {
    const err = e as ApiException<any>;
    if (err.code === 403) {
      // Namespace likely hasn't been created yet
      return json(404, res, {});
    }
    throw e;
  }

  return json(
    200,
    res,
    pods.items.map((pod) => ({
      id: pod.metadata?.uid,
      name: pod.metadata?.name,
      createdAt: pod.metadata?.creationTimestamp?.toISOString(),
      startedAt: pod.status?.startTime?.toISOString(),
      deploymentId: parseInt(
        pod.metadata.labels["anvilops.rcac.purdue.edu/deployment-id"],
      ),
      node: pod.spec?.nodeName,
      podScheduled:
        getCondition(pod?.status?.conditions, "PodScheduled")?.status ===
        "True",
      podReady:
        getCondition(pod?.status?.conditions, "Ready")?.status === "True",
      image: pod.status?.containerStatuses?.[0]?.image,
      containerReady: pod.status?.containerStatuses?.[0]?.ready,
      containerState: pod.status?.containerStatuses?.[0]?.state,
      lastState: pod.status?.containerStatuses?.[0].lastState,
    })),
  );
};

function getCondition(conditions: V1PodCondition[], condition: string) {
  return conditions.find((it) => it.type === condition);
}
