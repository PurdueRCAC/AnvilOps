import type { V1PodList } from "@kubernetes/client-node";
import stream from "node:stream";
import { db } from "../db/index.ts";
import type { components } from "../generated/openapi.ts";
import type { LogType } from "../generated/prisma/enums.ts";
import { getClientsForRequest } from "../lib/cluster/kubernetes.ts";
import { getNamespace } from "../lib/cluster/resources.ts";
import { AppNotFoundError, ValidationError } from "./common/errors.ts";

export async function getAppLogs(
  appId: number,
  deploymentId: number,
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
  if (typeof deploymentId !== "number") {
    // Extra sanity check due to potential SQL injection below in `subscribe`; should never happen because of openapi-backend's request validation and additional sanitization in `subscribe()`
    throw new Error("deploymentId must be a number.");
  }

  // If the user has enabled collectLogs, we can pull them from our DB. If not, pull them from Kubernetes directly.
  const config = await db.app.getDeploymentConfig(app.id);

  const collectLogs = config.appType === "workload" && config.collectLogs;

  if (collectLogs || type === "BUILD") {
    const fetchNewLogs = async () => {
      const newLogs = await db.deployment.getLogs(
        deploymentId,
        lastLogId,
        type,
        500,
      );
      if (newLogs.length > 0) {
        lastLogId = newLogs[0].id;
      }
      for (const log of newLogs) {
        await callback({
          id: log.id,
          type: log.type,
          stream: log.stream,
          log: log.content as string,
          pod: log.podName,
          time: log.timestamp.toISOString(),
        });
      }
    };

    // When new logs come in, send them to the client
    const unsubscribe = await db.subscribe(
      `deployment_${deploymentId}_logs`,
      fetchNewLogs,
    );

    abortController.signal.addEventListener("abort", unsubscribe);

    // Send all previous logs now
    await fetchNewLogs();
  } else {
    if (config.appType === "helm") {
      throw new ValidationError(
        "Application log browsing is not supported for Helm deployments",
      );
    }

    const { CoreV1Api: core, Log: log } = await getClientsForRequest(
      userId,
      app.projectId,
      ["CoreV1Api", "Log"],
    );
    let pods: V1PodList;
    try {
      pods = await core.listNamespacedPod({
        namespace: getNamespace(app.namespace),
        labelSelector: `anvilops.rcac.purdue.edu/deployment-id=${deploymentId}`,
      });
    } catch (err) {
      // Namespace may not be ready yet
      pods = { apiVersion: "v1", items: [] };
    }

    for (let podIndex = 0; podIndex < pods.items.length; podIndex++) {
      const pod = pods.items[podIndex];
      const podName = pod.metadata.name;
      const logStream = new stream.PassThrough();
      const logAbortController = await log.log(
        getNamespace(app.namespace),
        podName,
        pod.spec.containers[0].name,
        logStream,
        { follow: true, tailLines: 500, timestamps: true },
      );
      abortController.signal.addEventListener("abort", () =>
        logAbortController.abort(),
      );
      let i = 0;
      let current = "";
      logStream.on("data", async (chunk: Buffer) => {
        const str = chunk.toString();
        current += str;
        if (str.endsWith("\n") || str.endsWith("\r")) {
          const lines = current.split("\n");
          current = "";
          for (const line of lines) {
            if (line.trim().length === 0) continue;
            const [date, ...text] = line.split(" ");
            await callback({
              type: "RUNTIME",
              log: text.join(" "),
              stream: "stdout",
              pod: podName,
              time: date,
              id: podIndex * 100_000_000 + i,
            });
            i++;
          }
        }
      });
    }
  }
}
