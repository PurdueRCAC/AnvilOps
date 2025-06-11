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
  secrets: Secrets[];
  port: number;
  replicas: number;
};

const resources = {
  async namespaceExists(name: string) {
    try {
      await k8s.default.readNamespace({ name });
      return true;
    } catch (err) {
      return false;
    }
  },

  async deploymentExists(name: string, namespace: string) {
    try {
      await k8s.apps.readNamespacedDeployment({ name, namespace });
      return true;
    } catch (err) {
      return false;
    }
  },

  async serviceExists(name: string, namespace: string) {
    try {
      await k8s.default.readNamespacedService({ name, namespace });
      return true;
    } catch (err) {
      return false;
    }
  },

  async secretExists(name: string, namespace: string) {
    try {
      await k8s.default.readNamespacedSecret({ name, namespace });
      return true;
    } catch (err) {
      return false;
    }
  },
};

export const createDeploymentConfig = (app: AppParams): V1Deployment => {
  const env: V1EnvVar[] = Object.keys(app.env).map((key) => ({
    name: key,
    value: app.env[key],
  }));
  for (let secret of app.secrets) {
    for (let key of Object.keys(secret.data)) {
      if (key in app.env) {
        throw new Error("Duplicate environment variable.");
      }

      env.push({
        name: key,
        valueFrom: {
          secretKeyRef: {
            name: secret.name,
            key,
          },
        },
      });
    }
  }

  return {
    apiVersion: "apps/v1",
    kind: "Deployment",
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
    apiVersion: "v1",
    kind: "Service",
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

const createSecretConfig = (secret: Secrets, namespace: string) => {
  return {
    apiVersion: "v1",
    kind: "Secret",
    metadata: {
      name: secret.name,
      namespace,
    },
    stringData: secret.data,
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
  secrets?: Secrets[],
) => {
  const ns = {
    metadata: {
      name: namespace,
      annotations: {
        "field.cattle.io/projectId": `${process.env.PROJECT_NS}:${process.env.PROJECT_NAME}`,
      },
    },
  };

  if (!(await resources.namespaceExists(namespace))) {
    k8s.default.createNamespace({ body: ns });
  }
  for (let secret of secrets) {
    const body = createSecretConfig(secret, namespace);
    if (await resources.secretExists(secret.name, namespace)) {
      await k8s.full.patch(body);
    } else {
      await k8s.full.create(body);
    }
  }

  if (await resources.deploymentExists(deployment.metadata.name, namespace)) {
    await k8s.full.patch(deployment);
  } else {
    await k8s.full.create(deployment);
  }

  if (await resources.serviceExists(service.metadata.name, namespace)) {
    await k8s.full.patch(service);
  } else {
    await k8s.full.create(service);
  }

  console.log(`App ${deployment.metadata.name} updated`);
};
