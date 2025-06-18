import type { AuthenticatedRequest } from "../lib/api.ts";
import { db } from "../lib/db.ts";
import { k8s } from "../lib/kubernetes.ts";
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

  const logs = await db.log.findMany({
    where: {
      deploymentId: ctx.request.params.deploymentId,
      deployment: { appId: app.id },
      type: ctx.request.query.type,
    },
    orderBy: [{ timestamp: "desc" }, { index: "desc" }],
    take: 1000,
  });

  if (logs.length === 0 && ctx.request.query.type === "RUNTIME") {
    // Temporary workaround: if there are no runtime logs, try to fetch them from the pod directly.
    const pods = await k8s.default.listNamespacedPod({
      namespace: app.subdomain,
      labelSelector: `anvilops.rcac.purdue.edu/deployment-id=${ctx.request.params.deploymentId}`,
    });
    const pod = pods?.items?.[0];
    if (pod?.metadata?.name) {
      const logs = await k8s.default.readNamespacedPodLog({
        namespace: app.subdomain,
        name: pod.metadata.name,
      });
      return json(200, res, {
        logs: logs.split("\n").map((line, i) => ({
          log: line,
          time: pod.metadata.creationTimestamp.toISOString(),
          type: "RUNTIME" as const,
          id: i,
        })),
      });
    }
  }

  return json(200, res, {
    logs: logs.toReversed().map((line) => ({
      log: (line.content as any).log as string,
      time: line.timestamp.toISOString(),
      type: line.type,
      id: line.id,
    })),
  });
};
