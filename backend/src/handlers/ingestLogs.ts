import { db } from "../db/index.ts";
import type { LogType } from "../generated/prisma/enums.ts";
import type { LogUncheckedCreateInput } from "../generated/prisma/models.ts";
import { json, type HandlerMap } from "../types.ts";

export const ingestLogs: HandlerMap["ingestLogs"] = async (ctx, req, res) => {
  const authHeader = ctx.request.headers["authorization"]?.split(" ");
  if (authHeader[0] !== "Bearer") {
    return json(400, res, {
      code: 400,
      message: "Invalid authorization token type",
    });
  }

  // Authorize the request
  const token = authHeader[1];
  const result = await db.deployment.checkLogIngestSecret(
    ctx.request.requestBody.deploymentId!,
    token,
  );
  if (!result) {
    return json(403, res, {});
  }

  // Append the logs to the DB

  const logType: LogType = ({ build: "BUILD", runtime: "RUNTIME" } as const)[
    ctx.request.requestBody.type
  ];

  if (logType === undefined) {
    // Should never happen
    return json(400, res, { code: 400, message: "Missing log type." });
  }

  const logLines = ctx.request.requestBody.lines
    .map((line, i) => {
      return {
        content: line.content,
        deploymentId: ctx.request.requestBody.deploymentId,
        type: logType,
        timestamp: new Date(line.timestamp),
        index: i,
        podName: ctx.request.requestBody.hostname,
        stream: line.stream,
      } satisfies LogUncheckedCreateInput;
    })
    .filter((it) => it !== null);

  await db.deployment.insertLogs(logLines);

  return json(200, res, {});
};
