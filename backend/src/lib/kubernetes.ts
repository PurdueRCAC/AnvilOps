import {
  ApiException,
  AppsV1Api,
  BatchV1Api,
  CoreV1Api,
  KubeConfig,
  KubernetesObjectApi,
  PatchStrategy,
  V1EnvVar,
  V1Namespace,
} from "@kubernetes/client-node";
import { type Env, isObjectEmpty } from "../types.ts";

const kc = new KubeConfig();
kc.loadFromDefault();

export const k8s = {
  default: kc.makeApiClient(CoreV1Api),
  apps: kc.makeApiClient(AppsV1Api),
  batch: kc.makeApiClient(BatchV1Api),
  full: KubernetesObjectApi.makeApiClient(kc),
};

export const NAMESPACE_PREFIX = "anvilops-";

interface SvcParams {
  name: string;
  appName: string;
  namespace: string;
  targetPort: number;
  port?: number;
}

interface DeploymentParams {
  deploymentId: number;
  appId: number;
  name: string;
  namespace: string;
  image: string;
  env: V1EnvVar[];
  port: number;
  replicas: number;
}

interface AppParams {
  deploymentId: number;
  appId: number;
  name: string;
  namespace: string;
  image: string;
  env: Env[];
  secrets: Env[];
  loggingIngestSecret: string;
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

type StorageParams = {
  image: string;
  replicas: number;
  amount: number;
  port: number;
  mountPath: string;
  env: Env[];
};

export const resourceExists = async (data: K8sObject) => {
  try {
    await k8s.full.read(data);
    return true;
  } catch (err) {
    if (err instanceof ApiException) {
      // Assumes a namespace does not exist if request results in 403 Forbidden - potential false negative
      if ((data.kind === "Namespace" && err.code === 403) || err.code === 404) {
        return false;
      }
    }
    throw err;
  }
};

const createStorageConfigs = (app: AppParams) => {
  const storage = app.storage;
  const resourceName = `${app.name}-storage`;

  const env = getEnvVars([], storage.env, resourceName);
  const secrets =
    storage.env.length !== 0
      ? createSecretConfig(
          getSecretData(storage.env),
          resourceName,
          app.namespace,
        )
      : null;
  let mountPath = storage.mountPath;
  let port = storage.port;

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
                },
              ],
              volumeMounts: [
                {
                  name: `${resourceName}-data`,
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
            name: `${resourceName}-data`,
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

  return { storageSvc, statefulSet, secrets };
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
            "anvilops.rcac.purdue.edu/app-id": deploy.appId.toString(),
            "anvilops.rcac.purdue.edu/deployment-id":
              deploy.deploymentId.toString(),
            "anvilops.rcac.purdue.edu/collect-logs": "true",
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

export const createNamespaceConfig = (namespace: string) => {
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

/**
 * Creates the configuration needed for the kube-logging operator to forward logs from the user's pod to our backend.
 */
export const createLogConfig = (
  namespace: string,
  appId: number,
  secret: string,
) => {
  return [
    {
      apiVersion: "v1",
      kind: "Secret",
      metadata: {
        name: "anvilops-internal-logging-ingest",
        namespace,
      },
      stringData: {
        secret: secret,
      },
    },
    {
      apiVersion: "logging.banzaicloud.io/v1beta1",
      kind: "Flow",
      metadata: {
        name: `${namespace}-log-flow`,
        namespace,
      },
      spec: {
        match: [
          {
            select: {
              labels: {
                "anvilops.rcac.purdue.edu/collect-logs": "true",
              },
            },
          },
        ],
        localOutputRefs: [`${namespace}-log-output`],
      },
    },
    {
      apiVersion: "logging.banzaicloud.io/v1beta1",
      kind: "Output",
      metadata: {
        name: `${namespace}-log-output`,
        namespace,
      },
      spec: {
        http: {
          // https://kube-logging.dev/docs/configuration/plugins/outputs/http/
          endpoint: `https://anvilops.rcac.purdue.edu/api/logs/ingest?type=runtime&appId=${appId}`,
          auth: {
            username: {
              value: "anvilops",
            },
            password: {
              // https://kube-logging.dev/docs/configuration/plugins/outputs/secret/
              valueFrom: {
                secretKeyRef: {
                  name: "anvilops-internal-logging-ingest",
                  key: "secret",
                },
              },
            },
          },
          content_type: "application/jsonl",
          buffer: {
            type: "memory",
            tags: "time",
            timekey: "1s",
            timekey_wait: "0s",
            flush_mode: "immediate",
            flush_interval: "1s",
          },
        },
      },
    },
  ];
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

export const deleteStorage = async (appName: string, namespace: string) => {
  const name = `${appName}-storage`;
  if (
    await resourceExists({
      apiVersion: "apps/v1",
      kind: "StatefulSet",
      metadata: { name, namespace },
    })
  ) {
    await k8s.apps.deleteNamespacedStatefulSet({
      name: `${appName}-storage`,
      namespace,
    });
  }
  if (
    await resourceExists({
      apiVersion: "v1",
      kind: "Service",
      metadata: { name, namespace },
    })
  ) {
    await k8s.default.deleteNamespacedService({
      name: `${appName}-storage`,
      namespace,
    });
  }
  if (
    await resourceExists({
      apiVersion: "v1",
      kind: "Secret",
      metadata: { name, namespace },
    })
  ) {
    await k8s.default.deleteNamespacedSecret({
      name: `${appName}-storage`,
      namespace,
    });
  }
};

export const createAppConfigs = (
  app: AppParams,
): { namespace: K8sObject; configs: K8sObject[] } => {
  const namespace = createNamespaceConfig(app.namespace);
  const configs: K8sObject[] = [];

  const envVars = getEnvVars(app.env, app.secrets, `${app.name}-secrets`);
  const secretData = getSecretData(app.secrets);
  if (!isObjectEmpty(secretData)) {
    const secretConfig = createSecretConfig(
      secretData,
      `${app.name}-secrets`,
      app.namespace,
    );

    // Secrets should be created first
    configs.unshift(secretConfig);
  }

  if (app.storage) {
    const { storageSvc, statefulSet, secrets } = createStorageConfigs(app);
    if (secrets) configs.unshift(secrets);
    configs.push(statefulSet, storageSvc);
  }

  const svc = createServiceConfig({
    name: app.namespace,
    namespace: app.namespace,
    appName: app.name,
    port: 80,
    targetPort: app.port,
  });

  const deployment = createDeploymentConfig({
    deploymentId: app.deploymentId,
    appId: app.appId,
    name: app.name,
    namespace: app.namespace,
    image: app.image,
    env: envVars,
    port: app.port,
    replicas: app.replicas,
  });

  const logs = createLogConfig(
    app.namespace,
    app.appId,
    app.loggingIngestSecret,
  );

  configs.push(...logs, deployment, svc);
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
      await k8s.full.patch(
        config,
        undefined,
        undefined,
        undefined,
        undefined,
        PatchStrategy.MergePatch, // The default is PatchStrategy.StrategicMergePatch, which can target individual array items, but it doesn't work with custom resources (we're using `flow` and `output` from the kube-logging operator).
      );
    } else {
      await k8s.full.create(config);
    }
  }
  console.log(`App ${name} updated`);
};
