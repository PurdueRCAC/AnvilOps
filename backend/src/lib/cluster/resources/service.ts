import type { V1Service } from "@kubernetes/client-node";
import type { DeploymentParams } from "./statefulset.ts";
import type { K8sObject } from "../resources.ts";

export const createServiceConfig = (
  app: Pick<
    DeploymentParams,
    "name" | "namespace" | "serviceName" | "port" | "servicePort"
  >,
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
          port: app.servicePort,
          targetPort: app.port,
          protocol: "TCP",
        },
      ],
    },
  };
};
