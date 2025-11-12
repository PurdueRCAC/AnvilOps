import type {
  KubernetesObjectApi,
  V1EnvVar,
  V1Namespace,
  V1Secret,
} from "@kubernetes/client-node";
import type {
  App,
  AppGroup,
  Deployment,
  Organization,
} from "../../generated/prisma/client.ts";
import { getOctokit } from "../octokit.ts";
import { createIngressConfig } from "./resources/ingress.ts";
import { createServiceConfig } from "./resources/service.ts";
import {
  createStatefulSetConfig,
  generateAutomaticEnvVars,
  type DeploymentParams,
} from "./resources/statefulset.ts";

const NAMESPACE_PREFIX = "anvilops-";

// Namespace must pass RFC 1123 (and service must pass RFC 1035)
export const MAX_SUBDOMAIN_LEN = 63 - NAMESPACE_PREFIX.length;

// app.kubernetes.io/part-of label must pass RFC 1123
// `-{groupId}-{organizationId}` is appended to group name to create the label value
export const MAX_GROUPNAME_LEN = 50;

// StatefulSet name must pass RFC 1123
// The names of its pods, which are `{statefulset name}-{pod #}` also must pass RFC 1123
export const MAX_STS_NAME_LEN = 60;

export const getNamespace = (subdomain: string) => NAMESPACE_PREFIX + subdomain;

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
  deployment: Pick<Deployment, "appId" | "id" | "commitMessage"> & {
    app: Pick<
      App,
      | "id"
      | "name"
      | "displayName"
      | "logIngestSecret"
      | "subdomain"
      | "projectId"
    > & { appGroup: AppGroup; org: Pick<Organization, "githubInstallationId"> };
    config: ExtendedDeploymentConfig;
  },
) => {
  const app = deployment.app;
  const conf = deployment.config;
  const namespaceName = getNamespace(app.subdomain);

  const namespace = createNamespaceConfig(namespaceName, app.projectId);
  const configs: K8sObject[] = [];

  const octokit = await getOctokit(app.org.githubInstallationId);

  const secretName = `${app.name}-secrets-${deployment.id}`;
  const envVars = await getEnvVars(
    conf.getPlaintextEnv(),
    secretName,
    octokit,
    deployment,
  );
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

  const params: DeploymentParams = {
    deploymentId: deployment.id,
    name: app.name,
    namespace: namespaceName,
    serviceName: namespaceName,
    image: conf.imageTag,
    env: envVars,
    logIngestSecret: app.logIngestSecret,
    ...conf.fieldValues,
  };

  const svc = createServiceConfig(params);
  const ingress = createIngressConfig(params);
  const statefulSet = await createStatefulSetConfig(params);

  configs.push(statefulSet, svc);
  if (ingress !== null) {
    // ^ Can be null if APP_DOMAIN is not set, meaning no Ingress should be created for the app
    configs.push(ingress);
  }

  const appGroupLabel = `${deployment.app.appGroup.name.replaceAll(" ", "_")}-${deployment.app.appGroup.id}-${deployment.app.appGroup.orgId}`;
  const labels = {
    "anvilops.rcac.purdue.edu/app-group-id":
      deployment.app.appGroup.id.toString(),
    "anvilops.rcac.purdue.edu/app-id": deployment.appId.toString(),
    "anvilops.rcac.purdue.edu/deployment-id": deployment.id.toString(),
    "app.kubernetes.io/name": deployment.app.name,
    "app.kubernetes.io/part-of": appGroupLabel,
    "app.kubernetes.io/managed-by": "anvilops",
  };
  applyLabels(namespace, labels);
  for (let config of configs) {
    applyLabels(config, labels);
  }
  const postCreate = async (api: KubernetesObjectApi) => {
    // Clean up secrets from previous deployments of the app
    const secrets = (await api
      .list("v1", "Secret", namespaceName)
      .then((data) => data.items)) as V1Secret[];
    await Promise.all(
      secrets
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
