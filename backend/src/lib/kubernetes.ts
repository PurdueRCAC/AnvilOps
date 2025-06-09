import {
  AppsV1Api,
  BatchV1Api,
  CoreV1Api,
  KubeConfig,
  V1Deployment,
  V1EnvVar,
  V1Namespace,
  V1ObjectMeta,
  V1Service,
} from "@kubernetes/client-node";
import { App } from "octokit";
import { Env, Secrets } from "../types.ts";

const kc = new KubeConfig();
kc.loadFromDefault();

export const k8s = {
  default: kc.makeApiClient(CoreV1Api),
  apps: kc.makeApiClient(AppsV1Api),
  batch: kc.makeApiClient(BatchV1Api),
};

type AppParams = {
  name: string;
  image: string;
  env: Env;
  secrets: Secrets;
  port: number;
  replicas: number;
};

export const createNamespace = async (namespace: string) => {
  const ns = {
    metadata: {
      name: namespace,
    },
  };
  await k8s.default.createNamespace({ body: ns });
};

export const createSecret = async (
  namespace: string,
  name: string,
  data: { [key: string]: string },
) => {
  const secret = {
    metadata: {
      name,
    },
    data,
  };
  await k8s.default.createNamespacedSecret({ namespace, body: secret });
};

export const createDeploymentConfig = (app: AppParams): V1Deployment => {
  const env: V1EnvVar[] = Object.keys(app.env).map((key) => ({
    name: key,
    value: app.env[key],
  }));
  for (let [secret, data] of Object.entries(app.secrets)) {
    for (let key of Object.keys(data)) {
      if (key in app.env) {
        throw new Error("Duplicate environment variable.");
      }

      env.push({
        name: key,
        valueFrom: {
          secretKeyRef: {
            name: secret,
            key,
          },
        },
      });
    }
  }

  return {
    metadata: {
      name: app.name,
    },
    spec: {
      selector: {
        matchLabels: {
          app: app.name,
        },
      },
      replicas: app.replicas,
      template: {
        metadata: {
          labels: {
            app: app.name,
          },
        },
        spec: {
          containers: [
            {
              name: app.name,
              image: app.image,
              ports: [
                {
                  containerPort: app.port,
                  protocol: "TCP",
                },
              ],
              env,
            },
          ],
        },
      },
    },
  };
};

export const createServiceConfig = (
  app: AppParams,
  name: string,
): V1Service => {
  return {
    metadata: {
      name: name,
    },
    spec: {
      type: "ClusterIP",
      selector: {
        app: app.name,
      },
      ports: [
        {
          port: 80,
          targetPort: app.port,
          protocol: "TCP",
        },
      ],
    },
  };
};

export const createAppInNamespace = async (infra: {
  namespace: string;
  deployment: V1Deployment;
  service: V1Service;
}) => {
  await k8s.apps.createNamespacedDeployment({
    namespace: infra.namespace,
    body: infra.deployment,
  });
  console.log(
    `Deployment ${infra.deployment.metadata.name} created in ${infra.namespace}`,
  );
  await k8s.default.createNamespacedService({
    namespace: infra.namespace,
    body: infra.service,
  });
  console.log(
    `ClusterIP ${infra.service.metadata.name} created in ${infra.namespace}`,
  );
};

export const deleteNamespace = async (namespace: string) => {
  await k8s.default.deleteNamespace({
    name: namespace,
  });

  console.log(`Namespace ${namespace} deleted`);
};
