import { SpanStatusCode, trace } from "@opentelemetry/api";
import { db } from "../db/index.ts";
import type { Organization } from "../db/models.ts";
import { logger } from "../index.ts";

export async function createOrg(
  name: string,
  firstUserId: number,
): Promise<Organization> {
  try {
    const org = await db.org.create(name, firstUserId);
    logger.info({ name, firstUserId, orgId: org.id }, "Organization created");
    return org;
  } catch (err) {
    const span = trace.getActiveSpan();
    span?.recordException(err as Error);
    span?.setStatus({
      code: SpanStatusCode.ERROR,
      message: "Failed to create organization",
    });
    throw err;
  }
}
