import { db } from "../db/index.ts";
import { namespaceInUse } from "../lib/cluster/kubernetes.ts";
import { getNamespace } from "../lib/cluster/resources.ts";
import { json, type HandlerMap } from "../types.ts";
import type { AuthenticatedRequest } from "./index.ts";

export const isSubdomainAvailable: HandlerMap["isSubdomainAvailable"] = async (
  ctx,
  req: AuthenticatedRequest,
  res,
) => {
  const subdomain = ctx.request.query.subdomain;

  if (
    subdomain.length > 54 ||
    subdomain.match(/^[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?$/) === null
  ) {
    return json(400, res, { code: 400, message: "Invalid subdomain." });
  }

  const [namespaceExists, subdomainUsedByApp] = await Promise.all([
    namespaceInUse(getNamespace(subdomain)),
    // Check database in addition to resources in case the namespace is taken but not finished creating
    db.app.isSubdomainInUse(subdomain),
  ]);

  return json(200, res, { available: !namespaceExists && !subdomainUsedByApp });
};
