import {
  ApiException,
  AppsV1Api,
  BatchV1Api,
  CoreV1Api,
  KubeConfig,
  KubernetesObjectApi,
  PatchStrategy,
  type V1EnvVar,
  type V1Namespace,
  type V1StatefulSet,
} from "@kubernetes/client-node";
import crypto from "node:crypto";
import type {
  App,
  Deployment,
  MountConfig,
} from "../generated/prisma/client.ts";
import { db } from "./db.ts";
type DeploymentConfig = Awaited<
  ReturnType<typeof db.deploymentConfig.findUnique>
>;

const kc = new KubeConfig();
kc.loadFromDefault();

export const k8s = {
  default: kc.makeApiClient(CoreV1Api),
  apps: kc.makeApiClient(AppsV1Api),
  batch: kc.makeApiClient(BatchV1Api),
  full: KubernetesObjectApi.makeApiClient(kc),
};

const NAMESPACE_PREFIX = "anvilops-";

export const getNamespace = (subdomain: string) => NAMESPACE_PREFIX + subdomain;
export const MAX_SUBDOMAIN_LEN = 63 - NAMESPACE_PREFIX.length;

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
  mounts: { path: string; amountInMiB: number }[];
}

interface K8sObject {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace?: string;
  };
}

export const namespaceInUse = async (namespace: string) => {
  return resourceExists({
    apiVersion: "v1",
    kind: "Namespace",
    metadata: { name: namespace },
  });
};

const resourceExists = async (data: K8sObject) => {
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

const generateVolumeName = (mountPath: string) => {
  // Volume names must be valid DNS labels (https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#dns-label-names)
  return (
    "anvilops-volums-" +
    crypto.createHash("md5").update(mountPath).digest("hex")
  );
};

const createStatefulSetConfig = (deploy: DeploymentParams) => {
  return {
    apiVersion: "apps/v1",
    kind: "StatefulSet",
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
      serviceName: deploy.namespace,
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
              imagePullPolicy: "Always",
              ports: [
                {
                  containerPort: deploy.port,
                  protocol: "TCP",
                },
              ],
              env: deploy.env,
              volumeMounts: deploy.mounts.map((mount) => ({
                mountPath: mount.path,
                name: generateVolumeName(mount.path),
              })),
            },
          ],
        },
      },
      volumeClaimTemplates: deploy.mounts.map((mount) => ({
        metadata: { name: generateVolumeName(mount.path) },
        spec: {
          accessModes: ["ReadWriteMany"],
          storageClassName: "anvil-filesystem",
          resources: { requests: { storage: `${mount.amountInMiB}Mi` } },
        },
      })),
    },
  } satisfies V1StatefulSet;
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
  env: PrismaJson.EnvVar[],
  secretName: string,
): V1EnvVar[] => {
  const envVars = [];
  for (let envVar of env) {
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

const getEnvRecord = (envVars: PrismaJson.EnvVar[]): Record<string, string> => {
  if (envVars.length == 0) return null;
  return envVars.reduce((data, env) => {
    return Object.assign(data, { [env.name]: env.value });
  }, {});
};

const createSecretConfig = (
  secrets: Record<string, string>,
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

export const createAppConfigsFromDeployment = (
  deployment: Pick<Deployment, "appId" | "id"> & {
    app: Pick<App, "name" | "logIngestSecret" | "subdomain">;
    config: Pick<
      DeploymentConfig,
      "id" | "getPlaintextEnv" | "port" | "replicas" | "imageTag"
    > & {
      mounts: Pick<MountConfig, "path" | "amountInMiB">[];
    };
  },
) => {
  const app = deployment.app;
  const conf = deployment.config;
  const namespaceName = getNamespace(app.subdomain);

  const namespace = createNamespaceConfig(namespaceName);
  const configs: K8sObject[] = [];

  const secretName = `${app.name}-secrets-${deployment.config.id}`;
  const envVars = getEnvVars(conf.getPlaintextEnv(), secretName);
  const secretData = getEnvRecord(conf.getPlaintextEnv());
  if (secretData !== null) {
    const secretConfig = createSecretConfig(
      secretData,
      secretName,
      namespaceName,
    );

    // Secrets should be created first
    configs.unshift(secretConfig);
  }

  const svc = createServiceConfig({
    name: namespaceName,
    namespace: namespaceName,
    appName: app.name,
    port: 80,
    targetPort: conf.port,
  });

  const statefulSet = createStatefulSetConfig({
    deploymentId: deployment.id,
    appId: deployment.appId,
    name: app.name,
    namespace: namespaceName,
    image: conf.imageTag,
    env: envVars,
    port: conf.port,
    replicas: conf.replicas,
    mounts: conf.mounts,
  });

  const logs = createLogConfig(
    namespaceName,
    deployment.appId,
    app.logIngestSecret,
  );

  configs.push(...logs, statefulSet, svc);
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
