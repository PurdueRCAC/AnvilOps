import { ApiException, type V1Ingress } from "@kubernetes/client-node";
import { env } from "../../../../lib/env.ts";
import type { KubernetesClientService } from "../kubernetes.ts";
import type { K8sObject } from "../resources.ts";

interface IngressInterface {
  name: string;
  namespace: string;
  serviceName: string;
  port: number;
  servicePort?: number;
  subdomain: string;
  createIngress: boolean;
}

export class IngressConfigService {
  private kubernetesService: KubernetesClientService;

  constructor(kubernetesService: KubernetesClientService) {
    this.kubernetesService = kubernetesService;
  }

  createIngressConfig(app: IngressInterface): (V1Ingress & K8sObject) | null {
    if (
      !app.createIngress ||
      !env.APP_DOMAIN ||
      URL.parse(env.APP_DOMAIN) === null
    ) {
      return null;
    }

    const appDomain = new URL(env.APP_DOMAIN);
    const hostname = app.subdomain + "." + appDomain.hostname;

    return {
      apiVersion: "networking.k8s.io/v1",
      kind: "Ingress",
      metadata: {
        name: app.serviceName,
        namespace: app.namespace,
      },
      spec: {
        ingressClassName: env.INGRESS_CLASS_NAME,
        rules: [
          {
            host: hostname,
            http: {
              paths: [
                {
                  pathType: "Prefix",
                  path: "/",
                  backend: {
                    service: {
                      name: app.serviceName,
                      port: {
                        number: 80,
                      },
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    };
  }

  /**
   * Does a dry-run of creating an Ingress with the specified subdomain.
   * @returns true if the dry-run succeeded, or false if it failed due to a request error (4xx), which indicates that the subdomain is probably taken.
   */
  async canCreateIngress(subdomain: string) {
    const config = this.createIngressConfig({
      createIngress: true,
      name: "anvilops-ingress-probe",
      namespace: env.CURRENT_NAMESPACE,
      port: 80,
      serviceName: "anvilops-ingress-probe",
      subdomain: subdomain,
      servicePort: 80,
    });

    try {
      await this.kubernetesService.dryRunCreate(config);
      return true;
    } catch (err) {
      if (err instanceof ApiException && err.code >= 400 && err.code < 500) {
        // The dry-run failed. This is probably due to an existing Ingress using the subdomain and path that we want to reserve.
        return false;
      }
      throw err;
    }
  }
}
