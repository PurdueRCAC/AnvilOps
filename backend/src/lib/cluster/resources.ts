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
} from "../../generated/prisma/client.ts";
import { env } from "../env.ts";
import { createLogConfig } from "./resources/log.ts";
import { createServiceConfig } from "./resources/service.ts";
import {
  createStatefulSetConfig,
  type DeploymentParams,
} from "./resources/statefulset.ts";

const NAMESPACE_PREFIX = "anvilops-";
export const MAX_SUBDOMAIN_LEN = 63 - NAMESPACE_PREFIX.length;
export const MAX_GROUPNAME_LEN = 56;

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

const getEnvVars = (
  env: DeploymentJson.EnvVar[],
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

const getEnvRecord = (
  envVars: DeploymentJson.EnvVar[],
): Record<string, string> => {
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

export const createAppConfigsFromDeployment = (
  deployment: Pick<Deployment, "appId" | "id"> & {
    app: Pick<
      App & { appGroup: AppGroup },
      "name" | "logIngestSecret" | "subdomain" | "appGroup"
    >;
    config: ExtendedDeploymentConfig;
  },
) => {
  const app = deployment.app;
  const conf = deployment.config;
  const namespaceName = getNamespace(app.subdomain);

  const namespace = createNamespaceConfig(
    namespaceName,
    app.appGroup.projectId,
  );
  const configs: K8sObject[] = [];

  const secretName = `${app.name}-secrets-${deployment.id}`;
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

  const params: DeploymentParams = {
    name: app.name,
    namespace: namespaceName,
    serviceName: namespaceName,
    image: conf.imageTag,
    env: envVars,
    ...conf.fieldValues,
  };

  const svc = createServiceConfig(params);

  const statefulSet = createStatefulSetConfig(params);

  const logs = createLogConfig(
    namespaceName,
    deployment.appId,
    app.logIngestSecret,
  );

  configs.push(...logs, statefulSet, svc);

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
