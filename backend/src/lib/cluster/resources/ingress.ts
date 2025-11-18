import type { V1Ingress } from "@kubernetes/client-node";
import { env } from "../../env.ts";
import type { K8sObject } from "../resources.ts";
import type { DeploymentParams } from "./statefulset.ts";

export const createIngressConfig = (
  app: Pick<
    DeploymentParams,
    | "name"
    | "namespace"
    | "serviceName"
    | "port"
    | "servicePort"
    | "subdomain"
    | "createIngress"
  >,
): (V1Ingress & K8sObject) | null => {
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
                      number: app.servicePort,
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
};
