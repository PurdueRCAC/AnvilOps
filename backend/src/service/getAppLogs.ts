import { ApiException, type V1PodList } from "@kubernetes/client-node";
import { metrics, ValueType } from "@opentelemetry/api";
import stream from "node:stream";
import { db } from "../db/index.ts";
import type { components } from "../generated/openapi.ts";
import type { LogType } from "../generated/prisma/enums.ts";
import { logger } from "../index.ts";
import { getClientsForRequest } from "../lib/cluster/kubernetes.ts";
import { AppNotFoundError, ValidationError } from "./common/errors.ts";

const meter = metrics.getMeter("log_viewer");
const dbConcurrentViewers = meter.createUpDownCounter(
  "anvilops_concurrent_db_log_viewers",
  {
    description:
      "The total number of open connections which are actively viewing a log stream from the database",
    valueType: ValueType.INT,
  },
);
const k8sConcurrentViewers = meter.createUpDownCounter(
  "anvilops_concurrent_k8s_log_viewers",
  {
    description:
      "The total number of open connections which are actively viewing a log stream directly from Kubernetes pods",
    valueType: ValueType.INT,
  },
);

export async function getAppLogs(
  appId: number,
  deploymentId: number | null,
  userId: number,
  type: LogType,
  lastLogId: number,
  abortController: AbortController,
  callback: (log: components["schemas"]["LogLine"]) => Promise<void>,
) {
  const app = await db.app.getById(appId, {
    requireUser: { id: userId },
  });

  if (app === null) {
    throw new AppNotFoundError();
  }

  // Pull logs from Postgres and send them to the client as they come in
  if (typeof deploymentId !== "number" && deploymentId !== null) {
    // Extra sanity check due to potential SQL injection below in `subscribe`; should never happen because of openapi-backend's request validation and additional sanitization in `subscribe()`
    throw new Error("deploymentId must be a number.");
  }

  // If the user has enabled collectLogs, we can pull them from our DB. If not, pull them from Kubernetes directly.
  const config = await db.app.getDeploymentConfig(app.id);

  const collectLogs = config.appType === "workload" && config.collectLogs;

  if (collectLogs || type === "BUILD") {
    const fetchNewLogs = async () => {
      const newLogs = await db.app.getLogs(
        app.id,
        deploymentId,
        lastLogId,
        type,
        500,
      );
      if (newLogs.length > 0) {
        lastLogId = newLogs[0].id;
      }

      await Promise.all(
        newLogs.map((log) =>
          callback({
            id: log.id,
            type: log.type,
            stream: log.stream,
            log: log.content,
            pod: log.podName,
            time: log.timestamp.toISOString(),
          }),
        ),
      );
    };

    const channel =
      deploymentId === null
        ? `app_${appId}_logs`
        : `deployment_${deploymentId}_logs`;

    // When new logs come in, send them to the client
    const unsubscribe = await db.subscribe(
      channel,
      () =>
        void fetchNewLogs().catch((err) =>
          logger.error(err, "Failed to fetch new logs"),
        ),
    );
    dbConcurrentViewers.add(1);

    abortController.signal.addEventListener("abort", () => {
      dbConcurrentViewers.add(-1);
      unsubscribe().catch((err) =>
        logger.error(err, "Failed to unsubscribe from log notifications"),
      );
    });

    // Send all previous logs now
    await fetchNewLogs();
  } else {
    if (config.appType === "helm") {
      throw new ValidationError(
        "Application log browsing is not supported for Helm deployments",
      );
    }

    if (!deploymentId) {
      const recentDeployment = await db.app.getMostRecentDeployment(appId);
      deploymentId = recentDeployment.id;
    }

    const { CoreV1Api: core, Log: log } = await getClientsForRequest(
      userId,
      app.projectId,
      ["CoreV1Api", "Log"],
    );
    let pods: V1PodList;
    try {
      pods = await core.listNamespacedPod({
        namespace: app.namespace,
        labelSelector: `anvilops.rcac.purdue.edu/deployment-id=${deploymentId}`,
      });
    } catch (err) {
      if (
        !(err instanceof ApiException) ||
        (err.code !== 404 && err.code !== 403)
      ) {
        logger.error(err, "Failed to fetch app pods list");
      }
      // Namespace may not be ready yet
      pods = { apiVersion: "v1", items: [] };
    }

    const promises = pods.items.map(async (pod, podIndex) => {
      const podName = pod.metadata.name;
      const logStream = new stream.PassThrough();
      const logAbortController = await log.log(
        app.namespace,
        podName,
        pod.spec.containers[0].name,
        logStream,
        { follow: true, tailLines: 500, timestamps: true },
      );
      k8sConcurrentViewers.add(1);
      abortController.signal.addEventListener("abort", () => {
        logAbortController.abort();
        k8sConcurrentViewers.add(-1);
      });
      let i = 0;
      let current = "";
      logStream.on("data", (chunk: Buffer) => {
        const str = chunk.toString();
        current += str;
        if (str.endsWith("\n") || str.endsWith("\r")) {
          const lines = current.split("\n");
          current = "";
          for (const line of lines) {
            if (line.trim().length === 0) continue;
            const [date, ...text] = line.split(" ");
            void callback({
              type: "RUNTIME",
              log: text.join(" "),
              stream: "stdout",
              pod: podName,
              time: date,
              id: podIndex * 100_000_000 + i,
            }).catch((err) => {
              logger.error(err, "Failed to process log callback");
            });
            i++;
          }
        }
      });
    });

    await Promise.all(promises);
  }
}
