import type {
  KubernetesObject,
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
  Domain,
  Organization,
  WorkloadConfig,
} from "../../../db/models.ts";
import { logger } from "../../../logger.ts";
import type { DeploymentConfigService } from "../deploymentConfig.ts";
import type { GitProviderFactoryService } from "../git/gitProvider.ts";
import type { IngressConfigService } from "./resources/ingress.ts";
import type { ServiceConfigService } from "./resources/service.ts";
import type { StatefulSetConfigService } from "./resources/statefulset.ts";

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

export class ClusterResourcesService {
  private gitProviderFactoryService: GitProviderFactoryService;
  private serviceConfigService: ServiceConfigService;
  private ingressConfigService: IngressConfigService;
  private statefulSetConfigService: StatefulSetConfigService;
  private deploymentConfigService: DeploymentConfigService;
  private createIngressNetworkPolicies: boolean;
  private allowedIngressPeers: V1NetworkPolicyPeer[] | null = null;
  private registryHostname: string;
  private imagePullUsername: string;
  private imagePullPassword: string;

  constructor(
    gitProviderFactoryService: GitProviderFactoryService,
    serviceConfigService: ServiceConfigService,
    ingressConfigService: IngressConfigService,
    statefulSetConfigService: StatefulSetConfigService,
    deploymentConfigService: DeploymentConfigService,
    createIngressNetworkPolicies: boolean,
    allowedLabels: Record<string, string>[],
    registryHostname: string,
    imagePullUsername: string,
    imagePullPassword: string,
  ) {
    this.gitProviderFactoryService = gitProviderFactoryService;
    this.serviceConfigService = serviceConfigService;
    this.ingressConfigService = ingressConfigService;
    this.statefulSetConfigService = statefulSetConfigService;
    this.deploymentConfigService = deploymentConfigService;
    this.createIngressNetworkPolicies = createIngressNetworkPolicies;
    this.registryHostname = registryHostname;
    this.imagePullUsername = imagePullUsername;
    this.imagePullPassword = imagePullPassword;

    if (createIngressNetworkPolicies && allowedLabels) {
      this.allowedIngressPeers = allowedLabels.map((labels) => ({
        namespaceSelector: {
          matchLabels: labels,
        },
        podSelector: {},
      }));
    }
  }

  async createAppConfigsFromDeployment({
    org,
    app,
    appGroup,
    deployment,
    config,
    customDomains,
    migrating = false,
  }: {
    org: Organization;
    app: App;
    appGroup: AppGroup;
    deployment: Deployment;
    config: WorkloadConfig;
    customDomains: Domain[];
    migrating?: boolean;
  }) {
    const namespace = createNamespaceConfig(app.namespace, app.projectId);
    const configs: K8sObject[] = [];

    const gitProvider =
      config.source === "GIT"
        ? await this.gitProviderFactoryService.getGitProvider(org.id)
        : null;

    const secretName = `${app.name}-secrets-${deployment.id}`;
    const envVars = await this.getEnvVars(
      config.getEnv(),
      secretName,
      gitProvider,
      deployment,
      config,
      app,
    );
    const secretData = this.getEnvRecord(config.getEnv());
    if (secretData !== null) {
      const secretConfig = this.createSecretConfig(
        secretData,
        secretName,
        app.namespace,
      );

      // Secrets should be created first
      configs.unshift(secretConfig);
    }
    configs.unshift(this.getImagePullSecret(app.namespace));

    const params = {
      deploymentId: deployment.id,
      collectLogs: config.collectLogs,
      name: app.name,
      namespace: app.namespace,
      serviceName: app.namespace,
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
      customDomains: customDomains,
    };

    const services = this.serviceConfigService.createServiceConfig(params);
    const ingress = this.ingressConfigService.createIngressConfig(params);
    const statefulSet =
      await this.statefulSetConfigService.createStatefulSetConfig(params);

    configs.push(statefulSet, ...services);
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
        (deleted, key): Record<string, null> => ({
          ...deleted,
          [key]: null,
        }),
        {},
      );
      applyLabels(namespace, deletedLabels);
      for (const config of configs) {
        applyLabels(config, deletedLabels);
      }
    } else {
      const netpol = this.createIngressNetPol({
        name: params.name,
        namespace: params.namespace,
        groupLabels,
      });

      if (netpol) {
        configs.push(netpol);
      }

      applyLabels(namespace, labels);
      for (const config of configs) {
        applyLabels(config, labels);
      }
    }

    const postCreate = async (api: KubernetesObjectApi) => {
      // Clean up secrets and ingresses from previous deployments of the app
      const outdatedResources: KubernetesObject[] = [];

      if (migrating) {
        if (this.createIngressNetworkPolicies) {
          // When migrating, AnvilOps-specific labels are removed, so grouping network policies will not work.
          // Delete all network policies that are managed by AnvilOps.
          const netpols = await api
            .list("networking.k8s.io/v1", "NetworkPolicy", app.namespace)
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
            api.list(type.apiVersion, type.kind, app.namespace).then((data) =>
              data.items.map((item) => ({
                ...item,
                apiVersion: type.apiVersion,
                kind: type.kind,
              })),
            ),
          ),
        );

        outdatedResources.push(
          ...resourceLists
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
          api
            .delete(resource)
            .catch((err) =>
              logger.error(
                err,
                "Failed to delete outdated Kubernetes resource",
              ),
            ),
        ),
      );
    };
    return { namespace, configs, postCreate };
  }

  async getEnvVars(
    env: PrismaJson.EnvVar[],
    secretName: string,
    ...autoEnvParams: Parameters<
      typeof this.deploymentConfigService.generateAutomaticEnvVars
    >
  ): Promise<V1EnvVar[]> {
    const envVars = [];
    for (const envVar of env) {
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

    const extraEnv =
      await this.deploymentConfigService.generateAutomaticEnvVars(
        ...autoEnvParams,
      );
    for (const envVar of extraEnv) {
      if (!envVars.some((it) => it.name === envVar.name)) {
        envVars.push({ name: envVar.name, value: envVar.value });
      }
    }

    return envVars;
  }

  getEnvRecord(envVars: PrismaJson.EnvVar[]): Record<string, string> {
    if (envVars.length == 0) return null;
    return envVars.reduce((data, env) => {
      return Object.assign(data, { [env.name]: env.value });
    }, {});
  }

  getImagePullSecret(namespace: string): V1Secret & K8sObject {
    const config = {
      auths: {
        [this.registryHostname]: {
          username: this.imagePullUsername,
          password: this.imagePullPassword,
          auth: Buffer.from(
            this.imagePullUsername + ":" + this.imagePullPassword,
          ).toString("base64"),
        },
      },
    };

    return {
      apiVersion: "v1",
      kind: "Secret",
      metadata: {
        name: "image-pull-secret",
        namespace,
      },
      type: "kubernetes.io/dockerconfigjson",
      data: {
        ".dockerconfigjson": Buffer.from(JSON.stringify(config)).toString(
          "base64",
        ),
      },
    };
  }

  createSecretConfig(
    secrets: Record<string, string>,
    name: string,
    namespace: string,
  ): V1Secret & K8sObject {
    return {
      apiVersion: "v1",
      kind: "Secret",
      metadata: {
        name,
        namespace,
      },
      stringData: secrets,
    };
  }

  createIngressNetPol({
    name,
    namespace,
    groupLabels,
  }: {
    name: string;
    namespace: string;
    groupLabels: { [key: string]: string };
  }): V1NetworkPolicy & K8sObject {
    if (!this.createIngressNetworkPolicies || !this.allowedIngressPeers) {
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
              ...this.allowedIngressPeers,
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
  }
}

function applyLabels(config: K8sObject, labels: { [key: string]: string }) {
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
}

export function createNamespaceConfig(
  namespace: string,
  projectId?: string,
): V1Namespace & K8sObject {
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
}
