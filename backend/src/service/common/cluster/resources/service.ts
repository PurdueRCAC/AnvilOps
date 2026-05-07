import type { V1Service } from "@kubernetes/client-node";
import type { K8sObject } from "../resources.ts";

interface ServiceParams {
  name: string;
  namespace: string;
  serviceName: string;
  port: number;
  servicePort?: number;
}

export class ServiceConfigService {
  private internalBaseURL: string;

  constructor(internalBaseURL: string) {
    this.internalBaseURL = internalBaseURL;
  }

  createServiceConfig(app: ServiceParams): (V1Service & K8sObject)[] {
    return [
      {
        apiVersion: "v1",
        kind: "Service",
        metadata: {
          name: app.serviceName,
          namespace: app.namespace,
        },
        spec: {
          type: "ClusterIP",
          selector: {
            app: app.name,
          },
          ports: [
            {
              port: app.servicePort ?? 80,
              targetPort: app.port,
              protocol: "TCP",
            },
          ],
        },
      },
      {
        apiVersion: "v1",
        kind: "Service",
        metadata: {
          name: "anvilops-backend",
          namespace: app.namespace,
        },
        spec: {
          // This Service points to the AnvilOps backend. We need this for certificate generation:
          // solving ACME challenges requires making a certain URL available on the domain that needs to be verified,
          // and we want to redirect that URL to the AnvilOps backend so that it can solve the challenge and continue generating the certificate.
          // See src/service/cluster/resources/ingress.ts and src/service/certGeneration.ts.
          type: "ExternalName",
          externalName: new URL(this.internalBaseURL).hostname,
        },
      },
    ];
  }
}
