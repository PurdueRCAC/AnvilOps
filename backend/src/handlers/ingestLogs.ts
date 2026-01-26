import type { LogType } from "../generated/prisma/enums.ts";
import {
  DeploymentNotFoundError,
  ValidationError,
} from "../service/common/errors.ts";
import { ingestLogs } from "../service/ingestLogs.ts";
import { empty, json, type HandlerMap } from "../types.ts";

export const ingestLogsHandler: HandlerMap["ingestLogs"] = async (
  ctx,
  req,
  res,
) => {
  const authHeader = ctx.request.headers["authorization"]?.split(" ");
  if (authHeader[0] !== "Bearer") {
    return json(400, res, {
      code: 400,
      message: "Invalid authorization token type",
    });
  }

  const token = authHeader[1];
  const logType: LogType = ({ build: "BUILD", runtime: "RUNTIME" } as const)[
    ctx.request.requestBody.type
  ];

  try {
    await ingestLogs(
      ctx.request.requestBody.deploymentId,
      token,
      ctx.request.requestBody.hostname,
      logType,
      ctx.request.requestBody.lines,
    );
    return empty(200, res);
  } catch (e) {
    if (e instanceof DeploymentNotFoundError) {
      // No deployment matches the ID and secret
      return empty(403, res);
    } else if (e instanceof ValidationError) {
      // This request is invalid
      return json(400, res, { code: 400, message: "Invalid log type" });
    }
    throw e;
  }
};
