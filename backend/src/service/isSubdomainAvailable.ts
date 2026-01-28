import { ApiException } from "@kubernetes/client-node";
import { db } from "../db/index.ts";
import { svcK8s } from "../lib/cluster/kubernetes.ts";
import { createIngressConfig } from "../lib/cluster/resources/ingress.ts";
import { env } from "../lib/env.ts";
import { isRFC1123 } from "../lib/validate.ts";
import { ValidationError } from "./common/errors.ts";

export async function isSubdomainAvailable(subdomain: string) {
  if (!isRFC1123(subdomain)) {
    throw new ValidationError("Invalid subdomain.");
  }

  const [appUsingSubdomain, ingressDryRun] = await Promise.all([
    db.app.getAppBySubdomain(subdomain),
    canCreateIngress(subdomain),
  ]);

  return appUsingSubdomain === null && ingressDryRun;
}

/**
 * Does a dry-run of creating an Ingress with the specified subdomain.
 * @returns true if the dry-run succeeded, or false if it failed due to a request error (4xx), which indicates that the subdomain is probably taken.
 */
export async function canCreateIngress(subdomain: string) {
  const config = createIngressConfig({
    createIngress: true,
    name: "anvilops-ingress-probe",
    namespace: env.CURRENT_NAMESPACE,
    port: 80,
    serviceName: "anvilops-ingress-probe",
    subdomain: subdomain,
    servicePort: 80,
  });

  try {
    await svcK8s["KubernetesObjectApi"].create(
      config,
      undefined,
      /* dryRun = */ "All",
    );
    return true;
  } catch (err) {
    if (err instanceof ApiException && err.code >= 400 && err.code < 500) {
      // The dry-run failed. This is probably due to an existing Ingress using the subdomain and path that we want to reserve.
      return false;
    }
    throw err;
  }
}
