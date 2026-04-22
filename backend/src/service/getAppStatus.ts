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
import { ValueType, metrics } from "@opentelemetry/api";
import type { AppRepo } from "../db/repo/app.ts";
import { logger } from "../logger.ts";
import type { KubernetesClientService } from "./common/cluster/kubernetes.ts";
import { AppNotFoundError } from "./errors/index.ts";

const meter = metrics.getMeter("app_status_viewer");
const concurrentViewers = meter.createUpDownCounter(
  "anvilops_concurrent_status_viewers",
  {
    description:
      "The total number of open connections which are actively watching an app's status",
    valueType: ValueType.INT,
  },
);

export type StatusUpdate = object;

export class GetAppStatusService {
  private appRepo: AppRepo;
  private kubernetesClientService: KubernetesClientService;

  constructor(
    appRepo: AppRepo,
    kubernetesClientService: KubernetesClientService,
  ) {
    this.appRepo = appRepo;
    this.kubernetesClientService = kubernetesClientService;
  }

  async getAppStatus(
    appId: number,
    userId: number,
    abortController: AbortController,
    callback: (status: StatusUpdate) => Promise<void>,
  ) {
    const app = await this.appRepo.getById(appId, {
      requireUser: { id: userId },
    });

    if (!app) {
      throw new AppNotFoundError();
    }

    let pods: V1PodList;
    let statefulSet: V1StatefulSet;
    let events: CoreV1EventList;

    const update = async () => {
      if (!pods) return;
      const newStatus = {
        pods: pods.items.map((pod) => {
          const rawDeploymentId = parseInt(
            pod.metadata?.labels?.["anvilops.rcac.purdue.edu/deployment-id"],
          );
          return {
            id: pod.metadata?.uid,
            name: pod.metadata?.name,
            createdAt: pod.metadata?.creationTimestamp,
            startedAt: pod.status?.startTime,
            deploymentId: Number.isFinite(rawDeploymentId)
              ? rawDeploymentId
              : null,
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
          };
        }),
        events: events?.items.map((event) => ({
          id: event.metadata.uid,
          reason: event.reason,
          message: event.message,
          count: event.count,
          firstTimestamp: event.firstTimestamp.toISOString(),
          lastTimestamp: event.lastTimestamp.toISOString(),
        })),
        ...(statefulSet && {
          statefulSet: {
            readyReplicas: statefulSet.status.readyReplicas,
            updatedReplicas: statefulSet.status.currentReplicas,
            replicas: statefulSet.status.replicas,
            generation: statefulSet.metadata.generation,
            observedGeneration: statefulSet.status.observedGeneration,
            currentRevision: statefulSet.status.currentRevision,
            updateRevision: statefulSet.status.updateRevision,
          },
        }),
      };

      await callback(newStatus);
    };

    const ns = app.namespace;

    const close = (err: unknown) => {
      if (
        !(err instanceof AbortError) &&
        !(
          typeof err === "object" &&
          "cause" in err &&
          err.cause instanceof AbortError
        )
      ) {
        logger.error(err, "Kubernetes watch failed");
      }
      abortController.abort();
    };

    concurrentViewers.add(1);
    abortController.signal.addEventListener("abort", () =>
      concurrentViewers.add(-1),
    );

    try {
      const config = await this.appRepo.getDeploymentConfig(appId);

      // Selects any pod when undefined
      const podLabelSelector =
        config.appType === "helm"
          ? config.watchLabels
          : "anvilops.rcac.purdue.edu/deployment-id";
      const {
        CoreV1Api: core,
        AppsV1Api: apps,
        Watch: watch,
      } = await this.kubernetesClientService.getClientsForRequest(
        userId,
        app.projectId,
        ["CoreV1Api", "AppsV1Api", "Watch"],
      );
      const podWatcher = await watchList(
        watch,
        `/api/v1/namespaces/${ns}/pods`,
        async () =>
          await core.listNamespacedPod({
            namespace: ns,
            labelSelector: podLabelSelector,
          }),
        { labelSelector: podLabelSelector },
        async (newValue) => {
          pods = newValue;
          await update();
        },
        close,
      );
      abortController.signal.addEventListener("abort", () =>
        podWatcher.abort(),
      );

      if (config.appType !== "helm") {
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
      }
    } catch (e) {
      close(e);
    }

    await update();
  }
}

function getCondition(conditions: V1PodCondition[], condition: string) {
  return conditions?.find((it) => it.type === condition);
}

async function watchList<T extends KubernetesListObject<KubernetesObject>>(
  watch: Watch,
  path: string,
  getInitialValue: () => Promise<T>,
  queryParams: Record<string, string | number>,
  callback: (newValue: T) => Promise<void>,
  stop: (err: object) => void,
) {
  let list: T;
  try {
    list = await getInitialValue();
    await callback(list);
    queryParams["resourceVersion"] = list.metadata.resourceVersion;
  } catch (e) {
    stop(new Error("Failed to fetch initial value for " + path, { cause: e }));
    return;
  }

  return await watch.watch(
    path,
    queryParams,
    (phase, object: KubernetesObject) => {
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
        default: {
          break;
        }
      }
      callback(structuredClone(list)).catch((e) => {
        stop(
          new Error("Failed to invoke update callback for " + path, {
            cause: e,
          }),
        );
      });
    },
    (err) => stop(new Error("Failed to watch " + path, { cause: err })),
  );
}
