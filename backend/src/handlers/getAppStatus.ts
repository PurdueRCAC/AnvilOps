import {
  AbortError,
  type CoreV1EventList,
  type KubernetesListObject,
  type KubernetesObject,
  type V1PodCondition,
  type V1PodList,
  type V1StatefulSet,
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

  res.set({
    "Cache-Control": "no-cache",
    "Content-Type": "text/event-stream",
    Connection: "keep-alive",
  });
  res.flushHeaders();

  let pods: V1PodList;
  let statefulSet: V1StatefulSet;
  let events: CoreV1EventList;

  let lastStatus: string;
  const update = () => {
    if (!pods || !events || !statefulSet) return;
    const newStatus = {
      pods: pods.items.map((pod) => ({
        id: pod.metadata?.uid,
        name: pod.metadata?.name,
        createdAt: pod.metadata?.creationTimestamp,
        startedAt: pod.status?.startTime,
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
    };

    const str = JSON.stringify(newStatus);
    if (str !== lastStatus) {
      lastStatus = str;
      res.write(`data: ${str}\n\n`);
    }
  };

  const ns = getNamespace(app.subdomain);

  try {
    const close = (err: any) => {
      if (!(err instanceof AbortError) && !(err.cause instanceof AbortError)) {
        console.error("Kubernetes watch failed: ", err);
      }
      res.end();
    };

    const podWatcher = await watchList(
      `/api/v1/namespaces/${ns}/pods`,
      async () =>
        await k8s.default.listNamespacedPod({
          namespace: ns,
        }),
      {},
      (newValue) => {
        pods = newValue;
        update();
      },
      close,
    );

    const statefulSetWatcher = await watchList(
      `/apis/apps/v1/namespaces/${ns}/statefulsets`,
      async () =>
        await k8s.apps.listNamespacedStatefulSet({
          namespace: ns,
        }),
      {},
      (newValue) => {
        statefulSet = newValue.items.find(
          (it) => it.metadata.name === app.name,
        );
        update();
      },
      close,
    );

    const fieldSelector = `involvedObject.kind=StatefulSet,involvedObject.name=${app.name},type=Warning`;

    const eventsWatcher = await watchList(
      `/api/v1/namespaces/${ns}/events`,
      async () =>
        await k8s.default.listNamespacedEvent({
          namespace: ns,
          fieldSelector,
          limit: 15,
        }),
      { fieldSelector, limit: 15 },
      (newValue) => {
        events = newValue;
        newValue.items = newValue.items.filter(
          (event) =>
            new Date(event.lastTimestamp).getTime() >
            (app.deployments?.[0]?.createdAt?.getTime() ?? 0),
        );
        update();
      },
      close,
    );

    req.on("close", () => {
      podWatcher.abort();
      eventsWatcher.abort();
      statefulSetWatcher.abort();
    });
  } catch (e) {
    // TODO
  }

  update();
};

function getCondition(conditions: V1PodCondition[], condition: string) {
  return conditions?.find((it) => it.type === condition);
}

async function watchList<T extends KubernetesListObject<KubernetesObject>>(
  path: string,
  getInitialValue: () => Promise<T>,
  queryParams: Record<string, any>,
  callback: (newValue: T) => void,
  stop: (err: any) => void,
) {
  let list: T;
  try {
    list = await getInitialValue();
    callback(list);
    queryParams["resourceVersion"] = list.metadata.resourceVersion;
  } catch (e) {
    stop(new Error("Failed to fetch initial value for " + path, { cause: e }));
    return;
  }

  return await k8s.watch.watch(
    path,
    queryParams,
    (phase, object: KubernetesObject, watch) => {
      switch (phase) {
        case "ADDED": {
          list.items.push(object);
          break;
        }
        case "MODIFIED": {
          const index = list.items.findIndex(
            (item) => item.metadata.uid === object.metadata.uid,
          );
          if (index === -1) {
            // Modified an item that we don't know about. Try adding it to the list.
            list.items.push(object);
          } else {
            list.items[index] = object;
          }
          break;
        }
        case "DELETED": {
          const index = list.items.findIndex(
            (item) => item.metadata.uid === object.metadata.uid,
          );
          if (index === -1) {
            // Deleted an item that we don't know about
            return;
          } else {
            list.items.splice(index, 1);
          }
          break;
        }
      }
      try {
        callback(structuredClone(list));
      } catch (e) {
        stop(
          new Error("Failed to invoke update callback for " + path, {
            cause: e,
          }),
        );
      }
    },
    (err) => stop(new Error("Failed to watch " + path, { cause: err })),
  );
}
