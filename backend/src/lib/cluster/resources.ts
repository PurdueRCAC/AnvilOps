import type {
  KubernetesObjectApi,
  V1EnvVar,
  V1Ingress,
  V1Namespace,
  V1Secret,
} from "@kubernetes/client-node";
import { randomBytes } from "node:crypto";
import type {
  App,
  AppGroup,
  Deployment,
  Organization,
  WorkloadConfig,
} from "../../db/models.ts";
import { getOctokit } from "../octokit.ts";
import { createIngressConfig } from "./resources/ingress.ts";
import { createServiceConfig } from "./resources/service.ts";
import {
  createDeploymentConfig,
  createStatefulSetConfig,
  generateAutomaticEnvVars,
} from "./resources/statefulset.ts";

// Subdomain must pass RFC 1123
export const MAX_SUBDOMAIN_LEN = 63;

// Namespace must pass RFC 1123
export const MAX_NAMESPACE_LEN = 63;

// app.kubernetes.io/part-of label must pass RFC 1123
// `-{groupId}-{organizationId}` is appended to group name to create the label value
export const MAX_GROUPNAME_LEN = 50;

// StatefulSet name must pass RFC 1123
// The names of its pods, which are `{statefulset name}-{pod #}` also must pass RFC 1123
export const MAX_STS_NAME_LEN = 60;

export const getRandomTag = (): string => randomBytes(4).toString("hex");
export const RANDOM_TAG_LEN = 8;

export const isStatefulSet = (config: WorkloadConfig) =>
  config.mounts.length > 0;

export interface K8sObject {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace?: string;
    labels?: {
      [key: string]: string;
    };
  };
  spec?: {
    template?: {
      metadata?: {
        labels?: {
          [key: string]: string;
        };
      };
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export const createNamespaceConfig = (
  namespace: string,
  projectId?: string,
): V1Namespace & K8sObject => {
  return {
    apiVersion: "v1",
    kind: "Namespace",
    metadata: {
      name: namespace,
      annotations: {
        ...(!!projectId && { "field.cattle.io/projectId": `${projectId}` }),
      },
    },
  };
};

const getEnvVars = async (
  env: PrismaJson.EnvVar[],
  secretName: string,
  ...autoEnvParams: Parameters<typeof generateAutomaticEnvVars>
): Promise<V1EnvVar[]> => {
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

  const extraEnv = await generateAutomaticEnvVars(...autoEnvParams);
  for (const envVar of extraEnv) {
    if (!envVars.some((it) => it.name === envVar.name)) {
      envVars.push({ name: envVar.name, value: envVar.value });
    }
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
): V1Secret & K8sObject => {
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

const applyLabels = (config: K8sObject, labels: { [key: string]: string }) => {
  config.metadata.labels = { ...config.metadata.labels, ...labels };
  if (config.spec?.template) {
    const meta = config.spec.template.metadata;
    if (!meta) {
      config.spec.template.metadata = {
        labels: labels,
      };
    } else {
      meta.labels = { ...meta.labels, ...labels };
    }
  }
};

export const createAppConfigsFromDeployment = async (
  org: Organization,
  app: App,
  appGroup: AppGroup,
  deployment: Deployment,
  conf: WorkloadConfig,
) => {
  const namespace = createNamespaceConfig(app.namespace, app.projectId);
  const configs: K8sObject[] = [];

  const octokit =
    conf.source === "GIT" ? await getOctokit(org.githubInstallationId) : null;

  const secretName = `${app.name}-secrets-${deployment.id}`;
  const envVars = await getEnvVars(
    conf.getEnv(),
    secretName,
    octokit,
    deployment,
    conf,
    app,
  );
  const secretData = getEnvRecord(conf.getEnv());
  if (secretData !== null) {
    const secretConfig = createSecretConfig(
      secretData,
      secretName,
      app.namespace,
    );

    // Secrets should be created first
    configs.unshift(secretConfig);
  }

  const params = {
    deploymentId: deployment.id,
    collectLogs: conf.collectLogs,
    name: app.name,
    namespace: app.namespace,
    serviceName: app.namespace,
    image: conf.imageTag,
    env: envVars,
    logIngestSecret: app.logIngestSecret,
    subdomain: conf.subdomain,
    createIngress: conf.createIngress,
    port: conf.port,
    replicas: conf.replicas,
    mounts: conf.mounts,
    requests: conf.requests,
    limits: conf.limits,
  };

  const svc = createServiceConfig(params);
  const ingress = createIngressConfig(params);

  const deploymentSpec =
    params.mounts.length === 0
      ? await createDeploymentConfig(params)
      : await createStatefulSetConfig(params);

  configs.push(deploymentSpec, svc);
  if (ingress !== null) {
    // ^ Can be null if APP_DOMAIN is not set, meaning no Ingress should be created for the app
    configs.push(ingress);
  }

  const appGroupLabel = `${appGroup.name.replaceAll(" ", "_")}-${appGroup.id}-${org.id}`;
  const labels = {
    "anvilops.rcac.purdue.edu/app-group-id": appGroup.id.toString(),
    "anvilops.rcac.purdue.edu/app-id": app.id.toString(),
    "anvilops.rcac.purdue.edu/deployment-id": deployment.id.toString(),
    "app.kubernetes.io/name": app.name,
    "app.kubernetes.io/part-of": appGroupLabel,
    "app.kubernetes.io/managed-by": "anvilops",
  };
  applyLabels(namespace, labels);
  for (let config of configs) {
    applyLabels(config, labels);
  }
  const postCreate = async (api: KubernetesObjectApi) => {
    // Clean up secrets and ingresses from previous deployments of the app
    const secrets = (await api
      .list("v1", "Secret", app.namespace)
      .then((data) => data.items)
      .then((data) =>
        data.map((d) => ({ ...d, apiVersion: "v1", kind: "Secret" })),
      )) as (V1Secret & K8sObject)[];
    const ingresses = (await api
      .list("networking.k8s.io/v1", "Ingress", app.namespace)
      .then((data) => data.items)
      .then((data) =>
        data.map((d) => ({
          ...d,
          apiVersion: "networking.k8s.io/v1",
          kind: "Ingress",
        })),
      )) as (V1Ingress & K8sObject)[];

    await Promise.all(
      [...secrets, ...ingresses]
        .filter(
          (secret) =>
            parseInt(
              secret.metadata.labels["anvilops.rcac.purdue.edu/deployment-id"],
            ) !== deployment.id,
        )
        .map((secret) => api.delete(secret).catch((err) => console.error(err))),
    );
  };
  return { namespace, configs, postCreate };
};
