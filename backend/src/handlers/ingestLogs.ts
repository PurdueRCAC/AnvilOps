import type { LogType } from "../generated/prisma/enums.ts";
import { db } from "../lib/db.ts";
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
    .map((line) => JSON.parse(line));

  await db.log.createMany({
    data: lines.map((line) => ({
      content: line,
      deploymentId: parseInt(
        line["kubernetes"]["labels"]["anvil.rcac.purdue.edu/deployment-id"],
      ),
      type: logType,
      timestamp: new Date(line["time"]),
    })),
  });

  return json(200, res, {});
};
