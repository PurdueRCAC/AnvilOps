import {
  AbortError,
  V1StatefulSet,
  type CoreV1EventList,
  type KubernetesListObject,
  type KubernetesObject,
  type V1Deployment,
  type V1PodCondition,
  type V1PodList,
  type Watch,
} from "@kubernetes/client-node";
import { ValueType, metrics } from "@opentelemetry/api";
import { db } from "../db/index.ts";
import { getClientsForRequest } from "../lib/cluster/kubernetes.ts";
import { isStatefulSet } from "../lib/cluster/resources.ts";
import { AppNotFoundError, ValidationError } from "./common/errors.ts";

const meter = metrics.getMeter("app_status_viewer");
const concurrentViewers = meter.createUpDownCounter(
  "anvilops_concurrent_status_viewers",
  {
    description:
      "The total number of open connections which are actively watching an app's status",
    valueType: ValueType.INT,
  },
);

export type StatusUpdate = {};

export async function getAppStatus(
  appId: number,
  userId: number,
  abortController: AbortController,
  callback: (status: StatusUpdate) => Promise<void>,
) {
  const [app, config] = await Promise.all([
    db.app.getById(appId, {
      requireUser: { id: userId },
    }),
    db.app.getDeploymentConfig(appId),
  ]);

  if (!app) {
    throw new AppNotFoundError();
  }

  if (config.appType === "helm") {
    throw new ValidationError("Cannot get app status for helm apps");
  }

  let pods: V1PodList;
  let deployment: V1StatefulSet | V1Deployment;
  let events: CoreV1EventList;

  const update = async () => {
    if (!pods || !events || !deployment) return;
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
      deployment: {
        readyReplicas: deployment.status.readyReplicas,
        replicas: deployment.spec.replicas,
        generation: deployment.metadata.generation,
        observedGeneration: deployment.status.observedGeneration,
        ...(deployment instanceof V1StatefulSet && {
          currentReplicas: deployment.status.currentReplicas,
          currentRevision: deployment.status.currentRevision,
          updateRevision: deployment.status.updateRevision,
        }),
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

  concurrentViewers.add(1);
  abortController.signal.addEventListener("abort", () =>
    concurrentViewers.add(-1),
  );

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

    let watcher: Awaited<ReturnType<typeof watchList>>;
    if (isStatefulSet(config.asWorkloadConfig())) {
      watcher = await watchList(
        watch,
        `/apis/apps/v1/namespaces/${ns}/statefulsets`,
        async () =>
          await apps.listNamespacedStatefulSet({
            namespace: ns,
          }),
        {},
        async (newValue) => {
          deployment = newValue.items.find(
            (it) => it.metadata.name === app.name,
          );
          await update();
        },
        close,
      );
    } else {
      watcher = await watchList(
        watch,
        `/apis/apps/v1/namespaces/${ns}/deployments`,
        async () =>
          await apps.listNamespacedDeployment({
            namespace: ns,
          }),
        {},
        async (newValue) => {
          deployment = newValue.items.find(
            (it) => it.metadata.name === app.name,
          );
          await update();
        },
        close,
      );
    }

    abortController.signal.addEventListener("abort", () => watcher.abort());

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
