import type {
  KubernetesObjectApi,
  V1EnvVar,
  V1Namespace,
  V1NetworkPolicy,
  V1NetworkPolicyPeer,
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
import { env } from "../env.ts";
import { getOctokit } from "../octokit.ts";
import { createIngressConfig } from "./resources/ingress.ts";
import { createServiceConfig } from "./resources/service.ts";
import {
  createStatefulSetConfig,
  generateAutomaticEnvVars,
} from "./resources/statefulset.ts";

const NAMESPACE_PREFIX = "anvilops-";

// Subdomain must pass RFC 1123
export const MAX_SUBDOMAIN_LEN = 63;

// Namespace must pass RFC 1123 (and service must pass RFC 1035)
export const MAX_NAMESPACE_LEN = 63 - NAMESPACE_PREFIX.length;

// app.kubernetes.io/part-of label must pass RFC 1123
// `-{groupId}-{organizationId}` is appended to group name to create the label value
export const MAX_GROUPNAME_LEN = 50;

// StatefulSet name must pass RFC 1123
// The names of its pods, which are `{statefulset name}-{pod #}` also must pass RFC 1123
export const MAX_STS_NAME_LEN = 60;

export const getRandomTag = (): string => randomBytes(4).toString("hex");
export const RANDOM_TAG_LEN = 8;

export const getNamespace = (subdomain: string) => NAMESPACE_PREFIX + subdomain;

let allowedIngressPeers: V1NetworkPolicyPeer[] | null;
const getAllowedIngressPeers = (): V1NetworkPolicyPeer[] | null => {
  if (!env.CREATE_INGRESS_NETPOL || !env.ALLOW_INGRESS_FROM) {
    return null;
  }

  if (!allowedIngressPeers) {
    const allowedLabels = JSON.parse(env.ALLOW_INGRESS_FROM) as {
      [key: string]: string;
    }[];
    allowedIngressPeers = allowedLabels.map((labels) => ({
      namespaceSelector: {
        matchLabels: labels,
      },
      podSelector: {},
    }));
  }

  return allowedIngressPeers;
};

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

const createIngressNetPol = ({
  name,
  namespace,
  groupLabels,
}: {
  name: string;
  namespace: string;
  groupLabels: { [key: string]: string };
}): V1NetworkPolicy & K8sObject => {
  if (!env.CREATE_INGRESS_NETPOL || !env.ALLOW_INGRESS_FROM) {
    return null;
  }

  return {
    apiVersion: "networking.k8s.io/v1",
    kind: "NetworkPolicy",
    metadata: {
      name,
      namespace,
    },
    spec: {
      podSelector: {
        matchLabels: groupLabels,
      },
      policyTypes: ["Ingress"],
      ingress: [
        {
          _from: [
            ...getAllowedIngressPeers(),
            {
              namespaceSelector: {
                matchLabels: groupLabels, // Allow ingress from pods in namespaces of this group
              },
              podSelector: {},
            },
          ],
        },
      ],
    },
  } satisfies V1NetworkPolicy;
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

export const createAppConfigsFromDeployment = async ({
  org,
  app,
  appGroup,
  deployment,
  config,
  migrating = false,
}: {
  org: Organization;
  app: App;
  appGroup: AppGroup;
  deployment: Deployment;
  config: WorkloadConfig;
  migrating?: boolean;
}) => {
  const namespaceName = getNamespace(app.namespace);

  const namespace = createNamespaceConfig(namespaceName, app.projectId);
  const configs: K8sObject[] = [];

  const octokit =
    config.source === "GIT" ? await getOctokit(org.githubInstallationId) : null;

  const secretName = `${app.name}-secrets-${deployment.id}`;
  const envVars = await getEnvVars(
    config.getEnv(),
    secretName,
    octokit,
    deployment,
    config,
    app,
  );
  const secretData = getEnvRecord(config.getEnv());
  if (secretData !== null) {
    const secretConfig = createSecretConfig(
      secretData,
      secretName,
      namespaceName,
    );

    // Secrets should be created first
    configs.unshift(secretConfig);
  }

  const params = {
    deploymentId: deployment.id,
    collectLogs: config.collectLogs,
    name: app.name,
    namespace: namespaceName,
    serviceName: namespaceName,
    image: config.imageTag,
    env: envVars,
    logIngestSecret: app.logIngestSecret,
    subdomain: config.subdomain,
    createIngress: config.createIngress,
    port: config.port,
    replicas: config.replicas,
    mounts: config.mounts,
    requests: config.requests,
    limits: config.limits,
  };

  const svc = createServiceConfig(params);
  const ingress = createIngressConfig(params);
  const statefulSet = await createStatefulSetConfig(params);

  configs.push(statefulSet, svc);
  if (ingress !== null) {
    // ^ Can be null if APP_DOMAIN is not set, meaning no Ingress should be created for the app
    configs.push(ingress);
  }

  const appGroupLabel = `${appGroup.name.replaceAll(" ", "_")}-${appGroup.id}-${org.id}`;
  const groupLabels = {
    "anvilops.rcac.purdue.edu/app-group-id": appGroup.id.toString(),
    "app.kubernetes.io/part-of": appGroupLabel,
  };
  const labels = {
    ...groupLabels,
    "anvilops.rcac.purdue.edu/app-id": app.id.toString(),
    "anvilops.rcac.purdue.edu/deployment-id": deployment.id.toString(),
    "app.kubernetes.io/name": app.name,
    "app.kubernetes.io/managed-by": "anvilops",
  };

  if (migrating) {
    // When migrating off AnvilOps, remove the labels by setting their values to null
    const deletedLabels = Object.keys(labels).reduce(
      (deleted, key) => ({ ...deleted, [key]: null }),
      {},
    );
    applyLabels(namespace, deletedLabels);
    for (let config of configs) {
      applyLabels(config, deletedLabels);
    }
  } else {
    const netpol = createIngressNetPol({
      name: params.name,
      namespace: params.namespace,
      groupLabels,
    });

    if (netpol) {
      configs.push(netpol);
    }

    applyLabels(namespace, labels);
    for (let config of configs) {
      applyLabels(config, labels);
    }
  }

  const postCreate = async (api: KubernetesObjectApi) => {
    // Clean up secrets and ingresses from previous deployments of the app
    const outdatedResources = [];

    if (migrating) {
      if (env.CREATE_INGRESS_NETPOL) {
        // When migrating, AnvilOps-specific labels are removed, so grouping network policies will not work.
        // Delete all network policies that are managed by AnvilOps.
        const netpols = await api
          .list("networking.k8s.io/v1", "NetworkPolicy", namespaceName)
          .then((data) =>
            data.items.map((item) => ({
              ...item,
              apiVersion: "networking.k8s.io/v1",
              kind: "NetworkPolicy",
            })),
          );

        outdatedResources.push(
          ...netpols.filter(
            (netpol) =>
              netpol.metadata.labels?.["app.kubernetes.io/managed-by"] ===
              "anvilops",
          ),
        );
      }
    } else {
      const resourceTypes = [
        {
          apiVersion: "v1",
          kind: "Secret",
        },
        {
          apiVersion: "networking.k8s.io/v1",
          kind: "Ingress",
        },
      ];

      const resourceLists = await Promise.all(
        resourceTypes.map((type) =>
          api.list(type.apiVersion, type.kind, namespaceName).then((data) =>
            data.items.map((item) => ({
              ...item,
              apiVersion: type.apiVersion,
              kind: type.kind,
            })),
          ),
        ),
      );

      outdatedResources.concat(
        resourceLists
          .flat()
          .filter(
            (resource) =>
              parseInt(
                resource.metadata.labels?.[
                  "anvilops.rcac.purdue.edu/deployment-id"
                ],
              ) !== deployment.id,
          ),
      );
    }

    await Promise.all(
      outdatedResources.map((resource) =>
        api.delete(resource).catch((err) => console.error(err)),
      ),
    );
  };
  return { namespace, configs, postCreate };
};
