import {
  AbortError,
  type CoreV1EventList,
  type KubernetesListObject,
  type KubernetesObject,
  type V1PodCondition,
  type V1PodList,
  type V1StatefulSet,
  type Watch,
} from "@kubernetes/client-node";
import { db } from "../db/index.ts";
import { getClientsForRequest } from "../lib/cluster/kubernetes.ts";
import { AppNotFoundError } from "./common/errors.ts";

export type StatusUpdate = {};

export async function getAppStatus(
  appId: number,
  userId: number,
  abortController: AbortController,
  callback: (status: StatusUpdate) => Promise<void>,
) {
  const app = await db.app.getById(appId, {
    requireUser: { id: userId },
  });

  if (!app) {
    throw new AppNotFoundError();
  }

  let pods: V1PodList;
  let statefulSet: V1StatefulSet;
  let events: CoreV1EventList;

  const update = async () => {
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

    await callback(newStatus);
  };

  const ns = app.namespace;

  const close = (err: any) => {
    if (!(err instanceof AbortError) && !(err.cause instanceof AbortError)) {
      console.error("Kubernetes watch failed: ", err);
    }
    abortController.abort();
  };

  try {
    const {
      CoreV1Api: core,
      AppsV1Api: apps,
      Watch: watch,
    } = await getClientsForRequest(userId, app.projectId, [
      "CoreV1Api",
      "AppsV1Api",
      "Watch",
    ]);
    const podWatcher = await watchList(
      watch,
      `/api/v1/namespaces/${ns}/pods`,
      async () =>
        await core.listNamespacedPod({
          namespace: ns,
          labelSelector: "anvilops.rcac.purdue.edu/deployment-id",
        }),
      { labelSelector: "anvilops.rcac.purdue.edu/deployment-id" },
      async (newValue) => {
        pods = newValue;
        await update();
      },
      close,
    );
    abortController.signal.addEventListener("abort", () => podWatcher.abort());

    const statefulSetWatcher = await watchList(
      watch,
      `/apis/apps/v1/namespaces/${ns}/statefulsets`,
      async () =>
        await apps.listNamespacedStatefulSet({
          namespace: ns,
        }),
      {},
      async (newValue) => {
        statefulSet = newValue.items.find(
          (it) => it.metadata.name === app.name,
        );
        await update();
      },
      close,
    );
    abortController.signal.addEventListener("abort", () =>
      statefulSetWatcher.abort(),
    );

    const fieldSelector = `involvedObject.kind=StatefulSet,involvedObject.name=${app.name},type=Warning`;

    const eventsWatcher = await watchList(
      watch,
      `/api/v1/namespaces/${ns}/events`,
      async () =>
        await core.listNamespacedEvent({
          namespace: ns,
          fieldSelector,
          limit: 15,
        }),
      { fieldSelector, limit: 15 },
      async (newValue) => {
        events = newValue;
        await update();
      },
      close,
    );
    abortController.signal.addEventListener("abort", () =>
      eventsWatcher.abort(),
    );
  } catch (e) {
    close(e);
  }

  await update();
}

function getCondition(conditions: V1PodCondition[], condition: string) {
  return conditions?.find((it) => it.type === condition);
}

async function watchList<T extends KubernetesListObject<KubernetesObject>>(
  watch: Watch,
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

  return await watch.watch(
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
