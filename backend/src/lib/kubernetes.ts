import {
  AppsV1Api,
  BatchV1Api,
  CoreV1Api,
  KubeConfig,
  V1EnvVar,
  KubernetesObjectApi,
  V1Secret,
} from "@kubernetes/client-node";
import { type Env, type Secrets } from "../types.ts";
import { randomBytes } from "node:crypto";

const kc = new KubeConfig();
kc.loadFromDefault();

export const k8s = {
  default: kc.makeApiClient(CoreV1Api),
  apps: kc.makeApiClient(AppsV1Api),
  batch: kc.makeApiClient(BatchV1Api),
  full: KubernetesObjectApi.makeApiClient(kc),
};

interface SvcParams {
  name: string;
  appName: string;
  namespace: string;
  targetPort: number;
  port?: number;
}

interface AppParams {
  name: string;
  namespace: string;
  image: string;
  env: Env;
  secrets: Secrets[];
  port: number;
  replicas: number;
  storage?: StorageParams;
}

interface K8sObject {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace?: string;
  };
}

export type SupportedDB =
  | { name: "postgres"; tag: "17" }
  | { name: "mysql"; tag: 9 };
type StorageParams = {
  type: SupportedDB;
  replicas: number;
  amount: number;
};

const resourceExists = async (data: K8sObject) => {
  try {
    await k8s.full.read(data);
    return true;
  } catch (err) {
    return false;
  }
};

const createStorageConfigs = (app: AppParams) => {
  const storage = app.storage;
  const resourceName = `${app.name}-${storage.type.name}`;

  const password = randomBytes(32).toString("hex");
  const env: V1EnvVar[] = [];
  let mountPath: string;
  let port: number;
  let exportEnv: V1EnvVar[];
  let secrets: (V1Secret & K8sObject)[];
  switch (storage.type.name) {
    case "postgres":
      mountPath = "/var/lib/postgresql/data";
      port = 5432;
      env.push({ name: "POSTGRES_USER", value: app.name });
      env.push({
        name: "POSTGRES_PASSWORD",
        valueFrom: {
          secretKeyRef: {
            name: "db-secret",
            key: "password",
          },
        },
      });
      env.push({ name: "POSTGRES_DB", value: app.name });
      exportEnv = env;
      secrets.push(
        createSecretConfig(
          { name: "db-secret", data: { password } },
          app.namespace,
        ),
      );
      break;
    case "mysql":
      mountPath = "/var/lib/mysql";
      port = 3306;
      env.push({
        name: "MYSQL_ROOT_PASSWORD",
        valueFrom: {
          secretKeyRef: {
            name: "db-secret",
            key: "password",
          },
        },
      });
      exportEnv = env;
      secrets.push(
        createSecretConfig(
          { name: "db-secret", data: { password } },
          app.namespace,
        ),
      );
      break;
  }

  const storageSvc = createServiceConfig({
    name: resourceName,
    namespace: app.namespace,
    appName: resourceName,
    port: 5432,
    targetPort: 5432,
  });

  const statefulSet = {
    apiVersion: "apps/v1",
    kind: "StatefulSet",
    metadata: {
      name: resourceName,
      namespace: app.namespace,
    },
    spec: {
      selector: {
        matchLabels: {
          app: resourceName,
        },
      },
      serviceName: resourceName,
      replicas: app.storage.replicas,
      template: {
        metadata: {
          labels: {
            app: resourceName,
          },
        },
        spec: {
          containers: [
            {
              name: resourceName,
              image: `${storage.type.name}:${storage.type.tag}`,
              ports: [
                {
                  containerPort: 5432,
                  name: `${storage.type.name}`,
                },
              ],
              volumeMounts: [
                {
                  name: `${app.name}-data`,
                  mountPath,
                },
              ],
              env,
            },
          ],
        },
      },
      volumeClaimTemplates: [
        {
          metadata: {
            name: `${app.name}-data`,
          },
          spec: {
            accessModes: ["ReadWriteMany"],
            storageClassName: "anvil-filesystem",
            resources: {
              requests: {
                storage: `${app.storage.amount}Gi`,
              },
            },
          },
        },
      ],
    },
  };

  return { storageSvc, statefulSet, exportEnv, secrets };
};

const createDeploymentConfig = (app: AppParams) => {
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

const createServiceConfig = (svc: SvcParams) => {
  return {
    apiVersion: "v1",
    kind: "Service",
    metadata: {
      name: svc.name,
      namespace: svc.namespace,
    },
    spec: {
      type: "ClusterIP",
      selector: {
        app: svc.appName,
      },
      ports: [
        {
          port: svc.port ?? 80,
          targetPort: svc.targetPort,
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

const createNamespaceConfig = (namespace: string) => {
  return {
    apiVersion: "v1",
    kind: "Namespace",
    metadata: {
      name: namespace,
      annotations: {
        "field.cattle.io/projectId": `${process.env.PROJECT_NS}:${process.env.PROJECT_NAME}`,
      },
    },
  };
};

const ensureNamespace = async (namespace: K8sObject) => {
  await k8s.default.createNamespace({ body: namespace });
  for (let i = 0; i < 20; i++) {
    if (resourceExists(namespace)) {
      return;
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  throw new Error("Timed out waiting for namespace to create");
};

export const deleteNamespace = async (namespace: string) => {
  await k8s.default.deleteNamespace({
    name: namespace,
  });
  console.log(`Namespace ${namespace} deleted`);
};

export const createAppConfigs = (
  app: AppParams,
): { namespace: K8sObject; configs: K8sObject[] } => {
  const namespace = createNamespaceConfig(app.namespace);
  const secrets = app.secrets.map((secrets) =>
    createSecretConfig(secrets, app.namespace),
  );
  const svc = createServiceConfig({
    name: app.namespace,
    namespace: app.namespace,
    appName: app.name,
    port: 80,
    targetPort: app.port,
  });
  const deployment = createDeploymentConfig(app);
  const configs: K8sObject[] = [...secrets, deployment, svc];
  if (app.storage) {
    const { storageSvc, statefulSet, exportEnv, secrets } =
      createStorageConfigs(app);
    deployment.spec.template.spec.containers[0].env.push(...exportEnv);
    configs.unshift(...secrets);
    configs.push(statefulSet, storageSvc);
  }
  return { namespace, configs };
};

export const createOrUpdateApp = async (
  name: string,
  namespace: K8sObject,
  configs: K8sObject[],
) => {
  if (!(await resourceExists(namespace))) {
    await ensureNamespace(namespace);
  }

  for (let config of configs) {
    if (await resourceExists(config)) {
      await k8s.full.patch(config);
    } else {
      await k8s.full.create(config);
    }
  }
  console.log(`App ${name} updated`);
};
