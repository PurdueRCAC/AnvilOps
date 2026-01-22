import { SpanStatusCode, trace } from "@opentelemetry/api";
import { db, NotFoundError } from "../db/index.ts";
import { logger } from "../index.ts";
import {
  InstallationNotFoundError,
  OrgNotFoundError,
} from "./common/errors.ts";

export async function claimOrg(
  orgId: number,
  unassignedInstallationId: number,
  userId: number,
) {
  try {
    await db.org.claimInstallation(orgId, unassignedInstallationId, userId);
    logger.info(
      { orgId, unassignedInstallationId, userId },
      "Installation claimed",
    );
  } catch (e) {
    if (e instanceof NotFoundError) {
      switch (e.message) {
        case "installation":
          throw new InstallationNotFoundError(e);
        case "organization":
          throw new OrgNotFoundError(e);
        default:
          throw e;
      }
    }

    const span = trace.getActiveSpan();
    span?.recordException(e as Error);
    span?.setStatus({ code: SpanStatusCode.ERROR });

    throw e;
  }
}
