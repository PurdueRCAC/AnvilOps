import { V1PodList } from "@kubernetes/client-node";
import stream from "node:stream";
import type { components } from "../generated/openapi.ts";
import type { AuthenticatedRequest } from "../lib/api.ts";
import { db, subscribe } from "../lib/db.ts";
import { getNamespace, k8s } from "../lib/kubernetes.ts";
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

  res.set({
    "Cache-Control": "no-cache",
    "Content-Type": "text/event-stream",
    Connection: "keep-alive",
  });
  res.flushHeaders();

  const sendLog = (log: components["schemas"]["LogLine"]) => {
    res.write(`data: ${JSON.stringify(log)}\n\n`);
  };

  if (ctx.request.query.type === "RUNTIME") {
    // Temporary workaround: if there are no runtime logs, try to fetch them from the pod directly.
    let pods: V1PodList;
    try {
      pods = await k8s.default.listNamespacedPod({
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
      const abortController = await k8s.log.log(
        getNamespace(app.subdomain),
        podName,
        pod.spec.containers[0].name,
        logStream,
        { follow: true, tailLines: 500, timestamps: true },
      );
      let i = 0;
      logStream.on("data", (chunk: Buffer) => {
        const lines = chunk.toString().split("\n");
        for (const line of lines) {
          if (line.trim().length === 0) continue;
          const [date, ...text] = line.toString().split(" ");
          sendLog({
            type: "RUNTIME",
            log: text.join(" "),
            pod: podName,
            time: date,
            id: podIndex * 100_000_000 + i,
          });
          i++;
        }
      });

      req.on("close", () => abortController.abort());
    }
  }

  // Pull logs from Postgres and send them to the client as they come in
  if (typeof ctx.request.params.deploymentId !== "number") {
    // Extra sanity check due to potential SQL injection below in `subscribe`; should never happen because of openapi-backend's request validation
    return;
  }
  let lastLogId = -1;

  const fetchNewLogs = async () => {
    // Fetch them in reverse order so that we can take only the 500 most recent lines
    const newLogs = await db.log.findMany({
      where: {
        id: { gt: lastLogId },
        deploymentId: ctx.request.params.deploymentId,
        type: ctx.request.query.type,
      },
      orderBy: [{ createdAt: "desc" }, { index: "desc" }],
      take: 500,
    });
    if (newLogs.length > 0) {
      lastLogId = newLogs[0].id;
    }
    for (let i = newLogs.length - 1; i >= 0; i--) {
      const log = newLogs[i];
      sendLog({
        id: log.id,
        type: log.type,
        log: (log.content as any).log as string,
        pod: log.podName,
        time: log.timestamp.toISOString(),
      });
    }
  };

  // When new logs come in, send them to the client
  const unsubscribe = await subscribe(
    `deployment_${ctx.request.params.deploymentId}_logs`,
    fetchNewLogs,
  );
  req.on("close", unsubscribe);

  // Send all previous logs now
  await fetchNewLogs();
};
