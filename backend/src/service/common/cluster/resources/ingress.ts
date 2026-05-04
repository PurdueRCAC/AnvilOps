import { ApiException, type V1Ingress } from "@kubernetes/client-node";
import type { Domain } from "../../../../db/models.ts";
import type { KubernetesClientService } from "../kubernetes.ts";
import type { K8sObject } from "../resources.ts";

interface IngressInterface {
  name: string;
  namespace: string;
  serviceName: string;
  port: number;
  servicePort?: number;
  subdomain: string;
  customDomains: Domain[];
  createIngress: boolean;
}

export class IngressConfigService {
  private kubernetesService: KubernetesClientService;
  private appDomain: string;
  private ingressClassName: string;
  private namespace: string;

  constructor(
    kubernetesService: KubernetesClientService,
    appDomain: string,
    ingressClassName: string,
    namespace: string,
  ) {
    this.kubernetesService = kubernetesService;
    this.appDomain = appDomain;
    this.ingressClassName = ingressClassName;
    this.namespace = namespace;
  }

  createIngressConfig(app: IngressInterface): (V1Ingress & K8sObject) | null {
    if (
      !app.createIngress ||
      !this.appDomain ||
      URL.parse(this.appDomain) === null
    ) {
      return null;
    }

    const appDomain = new URL(this.appDomain);
    const hostname = app.subdomain + "." + appDomain.hostname;

    const domains = [{ id: -1, name: hostname }, ...app.customDomains];

    return {
      apiVersion: "networking.k8s.io/v1",
      kind: "Ingress",
      metadata: {
        name: app.serviceName,
        namespace: app.namespace,
      },
      spec: {
        tls: domains
          .filter((it) => "status" in it && it.status === "GENERATED")
          .map((d) => ({
            hosts: [d.name],
            secretName: `anvilops-tls-${d.id}`,
          })),
        ingressClassName: this.ingressClassName,
        rules: domains.map((domain) => ({
          host: domain.name,
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
              ...(domain.id !== -1 // Custom domains need to be able to respond to ACME challenges for generating certificates
                ? [
                    {
                      pathType: "Prefix",
                      path: "/.well-known/acme-challenge/",
                      backend: {
                        service: {
                          // This is an ExternalName Service that points to the AnvilOps backend in the main namespace.
                          // We need this because Ingress rules must point to services within their namespace.
                          name: "anvilops-backend",
                          port: { number: 80 },
                        },
                      },
                    },
                  ]
                : []),
            ],
          },
        })),
      },
    } satisfies V1Ingress;
  }

  /**
   * Does a dry-run of creating an Ingress with the specified subdomain.
   * @returns true if the dry-run succeeded, or false if it failed due to a request error (4xx), which indicates that the subdomain is probably taken.
   */
  async canCreateIngress(subdomain: string) {
    const config = this.createIngressConfig({
      createIngress: true,
      name: "anvilops-ingress-probe",
      namespace: this.namespace,
      port: 80,
      serviceName: "anvilops-ingress-probe",
      subdomain: subdomain,
      customDomains: [],
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
