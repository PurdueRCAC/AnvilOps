import type {
  ApiException,
  CoreV1EventList,
  V1PodCondition,
  V1PodList,
  V1StatefulSet,
} from "@kubernetes/client-node";
import type { AuthenticatedRequest } from "../lib/api.ts";
import { db } from "../lib/db.ts";
import { getNamespace, k8s } from "../lib/kubernetes.ts";
import { json, type HandlerMap } from "../types.ts";

export const getAppStatus: HandlerMap["getAppStatus"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  const app = await db.app.findFirst({
    where: {
      id: ctx.request.params.appId,
      org: { users: { some: { userId: req.user.id } } },
    },
    include: {
      deployments: {
        take: 1,
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      },
    },
  });

  if (!app) {
    return json(404, res, {});
  }

  let pods: V1PodList;
  let statefulSet: V1StatefulSet;
  let events: CoreV1EventList;
  try {
    pods = await k8s.default.listNamespacedPod({
      namespace: getNamespace(app.subdomain),
    });

    statefulSet = await k8s.apps.readNamespacedStatefulSet({
      namespace: getNamespace(app.subdomain),
      name: app.name,
    });

    events = await k8s.default.listNamespacedEvent({
      namespace: getNamespace(app.subdomain),
      fieldSelector: `involvedObject.kind=StatefulSet,involvedObject.name=${app.name},type=Warning`,
      limit: 15,
    });

    // Only include events from after the most recent deployment was created
    events.items = events.items.filter(
      (event) =>
        new Date(event.lastTimestamp).getTime() >
        (app.deployments?.[0]?.createdAt?.getTime() ?? 0),
    );
  } catch (e) {
    const err = e as ApiException<any>;
    if (err.code === 403) {
      // Namespace likely hasn't been created yet
      return json(404, res, {});
    }
    if (err.code === 404) {
      // Resources inside the namespace haven't been created yet
      return json(404, res, {});
    }
    throw e;
  }

  return json(200, res, {
    pods: pods.items.map((pod) => ({
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
      ip: pod.status.podIP,
    })),
    events: events.items.map((event) => ({
      reason: event.reason,
      message: event.message,
      count: event.count,
      firstTimestamp: event.firstTimestamp.toISOString(),
      lastTimestamp: event.lastTimestamp.toISOString(),
    })),
    statefulSet: {
      readyReplicas: statefulSet.status.readyReplicas,
      updatedReplicas: statefulSet.status.currentReplicas,
      replicas: statefulSet.status.replicas,
      generation: statefulSet.metadata.generation,
      observedGeneration: statefulSet.status.observedGeneration,
      currentRevision: statefulSet.status.currentRevision,
      updateRevision: statefulSet.status.updateRevision,
    },
  });
};

function getCondition(conditions: V1PodCondition[], condition: string) {
  return conditions.find((it) => it.type === condition);
}
