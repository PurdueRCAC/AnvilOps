import type { V1Ingress } from "@kubernetes/client-node";
import { env } from "../../env.ts";
import type { K8sObject } from "../resources.ts";

interface IngressInterface {
  name: string;
  namespace: string;
  serviceName: string;
  port: number;
  servicePort?: number;
  subdomain: string;
}

export const createIngressConfig = (
  app: IngressInterface,
): (V1Ingress & K8sObject) | null => {
  if (!env.APP_DOMAIN || URL.parse(env.APP_DOMAIN) === null) {
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
};
