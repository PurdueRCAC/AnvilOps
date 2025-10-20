import { V1PodList } from "@kubernetes/client-node";
import { once } from "node:events";
import stream from "node:stream";
import type { components } from "../generated/openapi.ts";
import { getClientsForRequest } from "../lib/cluster/kubernetes.ts";
import { getNamespace } from "../lib/cluster/resources.ts";
import { db, subscribe } from "../lib/db.ts";
import { json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

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
    return json(404, res, { code: 404, message: "App not found." });
  }

  res.set({
    "Cache-Control": "no-cache",
    "Content-Type": "text/event-stream",
    Connection: "keep-alive",
  });
  res.flushHeaders();

  const sendLog = async (log: components["schemas"]["LogLine"]) => {
    const readyForMoreContent = res.write(
      `event: log\nid: ${log.id}\ndata: ${JSON.stringify(log)}\n\n`,
    );
    if (!readyForMoreContent) {
      await once(res, "drain");
    }
  };

  // Pull logs from Postgres and send them to the client as they come in
  if (typeof ctx.request.params.deploymentId !== "number") {
    // Extra sanity check due to potential SQL injection below in `subscribe`; should never happen because of openapi-backend's request validation and additional sanitization in `subscribe()`
    return json(400, res, {
      code: 400,
      message: "Deployment ID must be number.",
    });
  }

  let lastLogId = -1;

  {
    // The Last-Event-Id header allows SSE streams to resume after being disconnected: https://html.spec.whatwg.org/multipage/server-sent-events.html#the-last-event-id-header
    const lastEventId = req.headers["last-event-id"];
    if (lastEventId) {
      try {
        lastLogId = parseInt(lastEventId.toString());
      } catch {}
    }
  }

  let isFetchingFromK8sApi = false;

  const fetchNewLogs = async () => {
    if (isFetchingFromK8sApi) {
      // The user has seen logs from the K8s API. This only happens when there are no logs in the DB at the time the response starts.
      // To prevent duplication, close the connection. The client will reopen it and fetch logs exclusively from the DB now that they exist.
      res.end();
      return;
    }
    // Fetch them in reverse order so that we can take only the 500 most recent lines
    const newLogs = await db.log.findMany({
      where: {
        id: { gt: lastLogId },
        deploymentId: ctx.request.params.deploymentId,
        type: ctx.request.query.type,
      },
      orderBy: [{ timestamp: "desc" }, { index: "desc" }],
      take: 500,
    });
    if (newLogs.length > 0) {
      lastLogId = newLogs[0].id;
    }
    for (let i = newLogs.length - 1; i >= 0; i--) {
      const log = newLogs[i];
      await sendLog({
        id: log.id,
        type: log.type,
        stream: log.stream,
        log: log.content as string,
        pod: log.podName,
        time: log.timestamp.toISOString(),
      });
    }
    return newLogs.length > 0;
  };

  // When new logs come in, send them to the client
  const unsubscribe = await subscribe(
    `deployment_${ctx.request.params.deploymentId}_logs`,
    fetchNewLogs,
  );

  req.on("close", async () => {
    await unsubscribe();
  });

  // Send all previous logs now
  const found = await fetchNewLogs();

  if (!found && ctx.request.query.type === "RUNTIME") {
    // Temporary workaround: if there are no runtime logs, try to fetch them from the pod directly.
    isFetchingFromK8sApi = true;
    const { CoreV1Api: core, Log: log } = await getClientsForRequest(
      req.user.id,
      app.projectId,
      ["CoreV1Api", "Log"],
    );
    let pods: V1PodList;
    try {
      pods = await core.listNamespacedPod({
        namespace: getNamespace(app.subdomain),
        labelSelector: `anvilops.rcac.purdue.edu/deployment-id=${ctx.request.params.deploymentId}`,
      });
    } catch (err) {
      // Namespace may not be ready yet
      pods = { apiVersion: "v1", items: [] };
    }

    let podIndex = 0;
    for (const pod of pods.items) {
      podIndex++;
      const podName = pod.metadata.name;
      const logStream = new stream.PassThrough();
      const abortController = await log.log(
        getNamespace(app.subdomain),
        podName,
        pod.spec.containers[0].name,
        logStream,
        { follow: true, tailLines: 500, timestamps: true },
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
            await sendLog({
              type: "RUNTIME",
              log: text.join(" "),
              pod: podName,
              time: date,
              id: podIndex * 100_000_000 + i,
            });
            i++;
          }
        }
      });

      req.on("close", () => abortController.abort());
    }
  }

  res.write("event: pastLogsSent\ndata:\n\n"); // Let the browser know that all previous logs have been sent. If none were received, then there are no logs for this deployment so far.
};
