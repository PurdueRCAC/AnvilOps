import { db } from "../db/index.ts";
import type { LogType } from "../generated/prisma/enums.ts";
import type { LogUncheckedCreateInput } from "../generated/prisma/models.ts";
import { DeploymentNotFoundError, ValidationError } from "./common/errors.ts";

type LogLineInput = {
  content: string;
  stream: "stdout" | "stderr";
  timestamp: number;
};

export async function ingestLogs(
  deploymentId: number,
  token: string,
  podName: string,
  logType: LogType,
  lines: LogLineInput[],
) {
  // Authorize the request
  const result = await db.deployment.checkLogIngestSecret(deploymentId, token);
  if (!result) {
    throw new DeploymentNotFoundError();
  }

  // Append the logs to the DB
  if (!logType) {
    // Should never happen
    throw new ValidationError("Missing log type.");
  }

  const logLines = lines
    .map((line, i) => {
      return {
        content: line.content,
        deploymentId: deploymentId,
        type: logType,
        timestamp: new Date(line.timestamp),
        index: i,
        podName: podName,
        stream: line.stream,
      } satisfies LogUncheckedCreateInput;
    })
    .filter((it) => it !== null);

  await db.deployment.insertLogs(logLines);
}
