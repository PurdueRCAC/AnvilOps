import type { V1Service } from "@kubernetes/client-node";
import type { K8sObject } from "../resources.ts";

interface ServiceParams {
  name: string;
  namespace: string;
  serviceName: string;
  port: number;
  servicePort?: number;
}

export const createServiceConfig = (
  app: ServiceParams,
): V1Service & K8sObject => {
  return {
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
  };
};
