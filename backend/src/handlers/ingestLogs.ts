import type { LogType } from "../generated/prisma/enums.ts";
import type { LogUncheckedCreateInput } from "../generated/prisma/models.ts";
import { db, publish } from "../lib/db.ts";
import { json, type HandlerMap } from "../types.ts";

const buildLogSecret = process.env.BUILD_LOGGING_INGEST_SECRET;

export const ingestLogs: HandlerMap["ingestLogs"] = async (ctx, req, res) => {
  const authHeader = ctx.request.headers["authorization"]?.split(" ");
  if (authHeader[0] !== "Basic") {
    return json(422, res, {});
  }

  const auth = Buffer.from(authHeader[1], "base64").toString("utf-8");
  const [username, password] = auth.split(":");

  // Authorize the request
  switch (ctx.request.query.type) {
    case "build": {
      if (!buildLogSecret || buildLogSecret.length === 0) {
        return json(500, res, {});
      }
      if (username !== "anvilops-builder" || password !== buildLogSecret) {
        return json(403, res, {});
      }
      break;
    }
    case "runtime": {
      if (!ctx.request.query.appId) {
        return json(400, res, {});
      }
      const count = await db.app.count({
        where: { id: ctx.request.query.appId, logIngestSecret: password },
      });
      if (count !== 1) {
        return json(403, res, {});
      }
      break;
    }
    default: {
      return json(422, res, {});
    }
  }

  // Append the logs to the DB

  const logType: LogType = ({ build: "BUILD", runtime: "RUNTIME" } as const)[
    ctx.request.query.type
  ];

  if (logType === undefined) {
    // Should never happen
    return json(400, res, {});
  }

  const lines = (req.body as string)
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => {
      const parsed = JSON.parse(line);
      return {
        content: parsed,
        deploymentId: parseInt(
          parsed?.["kubernetes"]?.["labels"]?.[
            "anvilops.rcac.purdue.edu/deployment-id"
          ],
        ),
      };
    });

  const deploymentIds = [...new Set(lines.map((line) => line.deploymentId))];

  // Filter out any lines that point to a deployment that doesn't exist (or that the client shouldn't be able to see)
  const validDeployments = await db.deployment.findMany({
    where: {
      id: { in: deploymentIds },
      ...(ctx.request.query.type === "runtime"
        ? { app: { logIngestSecret: password } }
        : {}),
    },
    select: { id: true, app: { select: { logIngestSecret: true } } },
  });

  const ids = validDeployments.map((d) => d.id);

  for (let i = 0; i < lines.length; i++) {
    if (!ids.includes(lines[i].deploymentId)) {
      lines.splice(i, 1);
      i--;
    }
  }

  const logLines = lines
    .map((line, i) => {
      if (!line.deploymentId || isNaN(line.deploymentId)) return null;

      return {
        content: line.content,
        deploymentId: line.deploymentId,
        type: logType,
        timestamp: new Date(line.content["time"]),
        index: i,
        podName: line.content["kubernetes"]["pod_name"],
      } satisfies LogUncheckedCreateInput;
    })
    .filter((it) => it !== null);

  await db.log.createMany({
    data: logLines,
  });

  try {
    await Promise.all(
      deploymentIds.map(
        async (deploymentId) => await notifyLogStream(deploymentId),
      ),
    );
  } catch (error) {
    console.error("Failed to notify log listeners:", error);
  }

  return json(200, res, {});
};

export async function notifyLogStream(deploymentId: number) {
  if (typeof deploymentId !== "number") {
    throw new Error("Expected deploymentId to be a number");
  }
  await publish(`deployment_${deploymentId}_logs`, "");
}
