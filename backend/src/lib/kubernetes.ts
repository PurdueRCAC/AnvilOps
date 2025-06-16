import {
  AppsV1Api,
  BatchV1Api,
  CoreV1Api,
  KubeConfig,
  V1EnvVar,
  KubernetesObjectApi,
  V1Secret,
  ApiException,
  V1Namespace,
} from "@kubernetes/client-node";
import { type Env, isObjectEmpty } from "../types.ts";
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

interface DeploymentParams {
  name: string;
  namespace: string;
  image: string;
  env: V1EnvVar[];
  port: number;
  replicas: number;
}

interface AppParams {
  name: string;
  namespace: string;
  image: string;
  env: Env[];
  secrets: Env[];
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

export const SUPPORTED_DBS = ["postgres:17", "mysql:9"];
type StorageParams = {
  image: string;
  replicas: number;
  amount: number;
};

const resourceExists = async (data: K8sObject) => {
  try {
    await k8s.full.read(data);
    return true;
  } catch (err) {
    if (err instanceof ApiException && err.code === 404) {
      return false;
    }
    throw err;
  }
};

const createStorageConfigs = (app: AppParams) => {
  const storage = app.storage;
  if (!SUPPORTED_DBS.includes(storage.image)) {
    throw new Error("Unsupported database");
  }
  const [imageName, imageTag] = storage.image.split(":");
  const resourceName = `${app.name}-${imageName}`;

  const password = randomBytes(32).toString("hex");
  const env: V1EnvVar[] = [];
  const secrets = {};
  let mountPath: string;
  let port: number;
  switch (imageName) {
    case "postgres":
      mountPath = "/var/lib/postgresql/data";
      port = 5432;
      env.push({
        name: "POSTGRES_USER",
        valueFrom: {
          secretKeyRef: {
            name: `${app.name}-secrets`,
            key: "POSTGRES_USER",
          },
        },
      });
      env.push({
        name: "POSTGRES_PASSWORD",
        valueFrom: {
          secretKeyRef: {
            name: `${app.name}-secrets`,
            key: "POSTGRES_PASSWORD",
          },
        },
      });
      env.push({
        name: "POSTGRES_DB",
        valueFrom: {
          secretKeyRef: {
            name: `${app.name}-secrets`,
            key: "POSTGRES_DB",
          },
        },
      });

      secrets["POSTGRES_USER"] = app.name;
      secrets["POSTGRES_PASSWORD"] = password;
      secrets["POSTGRES_DB"] = app.name;
      break;
    case "mysql":
      mountPath = "/var/lib/mysql";
      port = 3306;
      env.push({
        name: "MYSQL_ROOT_PASSWORD",
        valueFrom: {
          secretKeyRef: {
            name: `${app.name}-secrets`,
            key: "MYSQL_ROOT_PASSWORD",
          },
        },
      });
      secrets["MYSQL_ROOT_PASSWORD"] = password;
      break;
  }

  const storageSvc = createServiceConfig({
    name: resourceName,
    namespace: app.namespace,
    appName: resourceName,
    port,
    targetPort: port,
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
              image: `${storage.image}`,
              ports: [
                {
                  containerPort: port,
                  name: `${imageName}`,
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

  return { storageSvc, statefulSet, env, secrets };
};

const createDeploymentConfig = (deploy: DeploymentParams) => {
  return {
    apiVersion: "apps/v1",
    kind: "Deployment",
    metadata: {
      name: deploy.name,
      namespace: deploy.namespace,
    },
    spec: {
      selector: {
        matchLabels: {
          app: deploy.name,
        },
      },
      replicas: deploy.replicas,
      template: {
        metadata: {
          labels: {
            app: deploy.name,
          },
        },
        spec: {
          containers: [
            {
              name: deploy.name,
              image: deploy.image,
              ports: [
                {
                  containerPort: deploy.port,
                  protocol: "TCP",
                },
              ],
              env: deploy.env,
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

const getEnvVars = (
  env: Env[],
  secrets: Env[],
  secretName: string,
): V1EnvVar[] => {
  const envVars = [];
  for (let envVar of env) {
    envVars.push({
      name: envVar.name,
      value: envVar.value,
    });
  }

  for (let envVar of secrets) {
    envVars.push({
      name: envVar.name,
      valueFrom: {
        secretKeyRef: {
          name: secretName,
          key: envVar.name,
        },
      },
    });
  }

  return envVars;
};

const getSecretData = (secrets: Env[]) => {
  return secrets.reduce((secretData, secret) => {
    return Object.assign(secretData, { [secret.name]: secret.value });
  }, {});
};

const createSecretConfig = (
  secrets: { [key: string]: string },
  name: string,
  namespace: string,
) => {
  return {
    apiVersion: "v1",
    kind: "Secret",
    metadata: {
      name,
      namespace,
    },
    stringData: secrets,
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

const ensureNamespace = async (namespace: V1Namespace & K8sObject) => {
  await k8s.default.createNamespace({ body: namespace });
  for (let i = 0; i < 20; i++) {
    if (await resourceExists(namespace)) {
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
  const configs: K8sObject[] = [];

  const envVars = getEnvVars(app.env, app.secrets, `${app.name}-secrets`);
  const secretData = getSecretData(app.secrets);
  if (app.storage) {
    const { storageSvc, statefulSet, env, secrets } = createStorageConfigs(app);
    for (let e of env) {
      if (e.name in app.env) {
        throw new Error(`Environment variable ${e.name} already defined`);
      }
    }
    // Collect environment variables to add to deployment
    envVars.push(...env);

    Object.assign(secretData, secrets);

    configs.push(statefulSet, storageSvc);
  }

  if (!isObjectEmpty(secretData)) {
    const secretConfig = createSecretConfig(
      secretData,
      `${app.name}-secrets`,
      app.namespace,
    );

    // Secrets should be created first
    configs.unshift(secretConfig);
  }

  const svc = createServiceConfig({
    name: app.namespace,
    namespace: app.namespace,
    appName: app.name,
    port: 80,
    targetPort: app.port,
  });
  const deployment = createDeploymentConfig({
    name: app.name,
    namespace: app.namespace,
    image: app.image,
    env: envVars,
    port: app.port,
    replicas: app.replicas,
  });
  configs.push(deployment, svc);
  return { namespace, configs };
};

export const createOrUpdateApp = async (
  name: string,
  namespace: V1Namespace & K8sObject,
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
