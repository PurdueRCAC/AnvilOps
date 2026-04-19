import { V1Pod } from "@kubernetes/client-node";
import { Ajv } from "ajv";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import type { App, Deployment, HelmConfig } from "../../db/models.ts";
import { logger } from "../../logger.ts";
import { ValidationError } from "../errors/index.ts";
import type { KubernetesClientService } from "./cluster/kubernetes.ts";
import type { RancherService } from "./cluster/rancher.ts";
import { createNamespaceConfig } from "./cluster/resources.ts";
import type { LogCollectionService } from "./cluster/resources/logs.ts";

type RegistryChart = {
  name: string;
  version: string;
  description?: string;
  note?: string;
  watchLabels?: string;
  anvilopsValues: Record<string, unknown>;
};

type ChartTagList = {
  name: string;
  tags: string[];
};

type HarborRepository = {
  artifact_count: number;
  creation_time: string;
  id: number;
  name: string;
  project_id: number;
  pull_count: number;
  update_time: string;
};

export class HelmService {
  private logCollectionSerice: LogCollectionService;
  private kubernetesService: KubernetesClientService;
  private rancherService: RancherService;
  private registryBaseURL: string;
  private chartsProjectName: string;
  private namespace: string;
  private helmDeployerImageTag: string;
  private internalBaseURL: string;

  constructor(
    logCollectionSerice: LogCollectionService,
    kubernetesService: KubernetesClientService,
    rancherService: RancherService,
    registryBaseURL: string,
    chartsProjectName: string,
    namespace: string,
    helmDeployerImageTag: string,
    internalBaseURL: string,
  ) {
    this.logCollectionSerice = logCollectionSerice;
    this.kubernetesService = kubernetesService;
    this.rancherService = rancherService;
    this.registryBaseURL = registryBaseURL;
    this.chartsProjectName = chartsProjectName;
    this.namespace = namespace;
    this.helmDeployerImageTag = helmDeployerImageTag;
    this.internalBaseURL = internalBaseURL;
    this.initAjv();
  }

  private ajv: Ajv;

  private initAjv() {
    this.ajv = new Ajv();
    try {
      const schema = JSON.parse(
        readFileSync("anvilops-values-schema.json").toString(),
      );
      this.ajv.addSchema(schema, "anvilops-values");
    } catch (e) {
      logger.warn(
        { error: e },
        "AnvilOps values validator could not be initialized",
      );
    }
  }

  async fetchJSONFromChartRegistry<T>(path: string, init?: RequestInit) {
    const res = await fetch(`${this.registryBaseURL}/${path}`, {
      ...init,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      throw new Error(
        `Failed to fetch JSON from chart registry ${path}: ${res.status} ${res.statusText}`,
      );
    }

    const text = await res.text();
    try {
      const json = JSON.parse(text) as T;
      return json;
    } catch (err) {
      throw new Error(
        `Failed to parse JSON from chart registry ${path}: ${text.slice(0, 500)}...`,
      );
    }
  }

  async getChartToken(): Promise<string> {
    try {
      const { token } = await this.fetchJSONFromChartRegistry<{
        token: string;
      }>(
        `service/token?service=harbor-registry&scope=repository:${this.chartsProjectName}/charts:pull`,
      );
      return token;
    } catch (err) {
      logger.error(err, "Failed to get Helm chart pull token");
      throw new Error(`Failed to get Helm chart pull token: ${err}`);
    }
  }

  async getChartRepositories(): Promise<HarborRepository[]> {
    try {
      return await this.fetchJSONFromChartRegistry<HarborRepository[]>(
        `api/v2.0/projects/${this.chartsProjectName}/repositories`,
      );
    } catch (err) {
      logger.error(err, "Failed to get Helm chart repositories");
      throw new Error(`Failed to get Helm chart repositories: ${err}`);
    }
  }

  async getChart(
    repository: string,
    version: string,
    token: string,
  ): Promise<RegistryChart> {
    let annotations: Record<string, string>;
    try {
      const res = await this.fetchJSONFromChartRegistry<{
        annotations: Record<string, string>;
      }>(`v2/${repository}/manifests/${version}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.oci.image.manifest.v1+json",
        },
      });
      annotations = res.annotations;
    } catch (err) {
      logger.error(err, "Failed to get Helm chart");
      throw new Error(
        `Failed to get Helm chart ${repository} ${version}: ${err}`,
      );
    }

    if (annotations["anvilops-values"]) {
      let anvilopsValues: unknown;
      try {
        anvilopsValues = JSON.parse(annotations["anvilops-values"]);
        if (!this.ajv.validate("anvilops-values", anvilopsValues)) {
          throw new Error(this.ajv.errors.toString());
        }
      } catch (err) {
        logger.warn(
          {
            repository,
            version,
            annotation: annotations["anvilops-values"],
            error: err,
          },
          `Invalid anvilops-values annotation on Helm chart ${repository} ${version}: ${err}`,
        );
        throw new Error(
          `Invalid anvilops-values annotation on Helm chart ${repository} ${version}: ${err}`,
        );
      }
      return {
        name: annotations["org.opencontainers.image.title"],
        version: annotations["org.opencontainers.image.version"],
        description: annotations["org.opencontainers.image.description"],
        note: annotations["anvilops-note"],
        watchLabels: annotations["anvilops-watch-labels"],
        anvilopsValues: anvilopsValues as Record<string, unknown>,
      };
    } else {
      return null;
    }
  }

  async getLatestChart(
    repository: string,
    token: string,
  ): Promise<RegistryChart | null> {
    const chartTagList = await this.fetchJSONFromChartRegistry<ChartTagList>(
      `v2/${repository}/tags/list`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    return await this.getChart(
      chartTagList.name,
      chartTagList.tags[chartTagList.tags.length - 1],
      token,
    );
  }

  async upgrade(app: App, deployment: Deployment, config: HelmConfig) {
    const namespaceName = app.namespace;

    // Create namespace through Kubernetes API to ensure required Rancher annotations
    const api = this.kubernetesService.getClientForClusterUsername(
      app.clusterUsername,
      "KubernetesObjectApi",
      this.rancherService.shouldImpersonate(app.projectId),
    );
    const namespace = createNamespaceConfig(namespaceName, app.projectId);
    if (!(await this.kubernetesService.resourceExists(api, namespace))) {
      try {
        await this.kubernetesService.ensureNamespace(api, namespace);
      } catch (err) {
        throw new Error(`Failed to create namespace ${namespaceName}: ${err}`);
      }
    }

    const args = ["upgrade", "--install", "--namespace", namespaceName];

    const { urlType, url, version, values } = config;
    const release = app.name;

    for (const [key, value] of Object.entries(values)) {
      args.push("--set", `${key}=${value}`);
    }
    switch (urlType) {
      // example: helm install mynginx https://example.com/charts/nginx-1.2.3.tgz
      case "absolute": {
        args.push(release, url);
        break;
      }

      // example: helm install mynginx --version 1.2.3 oci://example.com/charts/nginx
      case "oci": {
        args.push(release, "--version", version, url);
        break;
      }

      default: {
        throw new ValidationError("Unknown Helm installation URL type");
      }
    }

    const podTemplate: V1Pod = {
      metadata: {
        labels: {
          "anvilops.rcac.purdue.edu/app-id": app.id.toString(),
          "anvilops.rcac.purdue.edu/deployment-id": deployment.id.toString(),
        },
      },
      spec: {
        automountServiceAccountToken: false,
        containers: [
          {
            env: [
              { name: "DEPLOYMENT_API_SECRET", value: deployment.secret },
              {
                name: "DEPLOYMENT_API_URL",
                value: `${this.internalBaseURL}/api`,
              },
              {
                name: "KUBECONFIG",
                value: "/opt/creds/kubeconfig",
              },
              {
                name: "HELM_KUBEASUSER",
                value: this.rancherService.shouldImpersonate(app.projectId)
                  ? app.clusterUsername
                  : "",
              },
              {
                name: "HELM_ARGS",
                value: args.join("\n"),
              },
            ],
            name: "helm",
            image: this.helmDeployerImageTag,
            volumeMounts: [
              {
                name: "kubeconfig",
                mountPath: "/opt/creds",
                readOnly: true,
              },
            ],
            resources: {
              limits: {
                cpu: "500m",
                memory: "500Mi",
              },
              requests: {
                cpu: "250m",
                memory: "128Mi",
              },
            },
            securityContext: {
              capabilities: {
                drop: ["ALL"],
              },
              runAsNonRoot: true,
              runAsUser: 65532,
              runAsGroup: 65532,
              allowPrivilegeEscalation: false,
            },
          },
        ],
        volumes: [
          {
            name: "kubeconfig",
            secret: {
              secretName: "kube-auth",
              items: [
                {
                  key: "kubeconfig",
                  path: "kubeconfig",
                },
              ],
            },
          },
        ],
        restartPolicy: "Never",
      },
    };

    const label = randomBytes(4).toString("hex");
    const jobName = `helm-upgrade-${release}-${label}`;
    try {
      await this.kubernetesService.createNamespacedJob({
        namespace: this.namespace,
        body: {
          metadata: {
            name: jobName,
            labels: {
              "anvilops.rcac.purdue.edu/app-id": app.id.toString(),
              "anvilops.rcac.purdue.edu/deployment-id":
                deployment.id.toString(),
            },
          },
          spec: {
            ttlSecondsAfterFinished: 5 * 60,
            backoffLimit: 1,
            activeDeadlineSeconds: 5 * 60,
            template: await this.logCollectionSerice.wrapWithLogExporter(
              "build",
              app.logIngestSecret,
              deployment.id,
              podTemplate,
            ),
          },
        },
      });
    } catch (e) {
      logger.error(e, "Failed to create Helm deployment job");
      throw e;
    }
  }
}
