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
  KubernetesObjectApi,
} from "@kubernetes/client-node";
import { type Env, type Secrets } from "../types.ts";

const kc = new KubeConfig();
kc.loadFromDefault();

export const k8s = {
  default: kc.makeApiClient(CoreV1Api),
  apps: kc.makeApiClient(AppsV1Api),
  batch: kc.makeApiClient(BatchV1Api),
  full: KubernetesObjectApi.makeApiClient(kc),
};

type AppParams = {
  name: string;
  namespace: string;
  image: string;
  env: Env;
  secrets: Secrets;
  port: number;
  replicas: number;
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
      namespace: app.namespace,
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
      namespace: app.namespace,
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

export const deleteNamespace = async (namespace: string) => {
  await k8s.default.deleteNamespace({
    name: namespace,
  });
  console.log(`Namespace ${namespace} deleted`);
};

export const createOrUpdateApp = async (
  namespace: string,
  deployment: V1Deployment,
  service?: V1Service,
  secrets?: Secrets,
) => {
  const ns = {
    metadata: {
      name: namespace,
    },
  };

  // patch is the equivalent of kubectl apply -f
  k8s.full.patch(ns);
  for (let secret in secrets) {
    const body = {
      metadata: {
        name: secret,
      },
      stringData: secrets[secret],
    };

    await k8s.full.patch(body);
  }

  await k8s.full.patch(deployment);
  await k8s.full.patch(service);

  console.log(`App ${deployment.metadata.name} updated`);
};
