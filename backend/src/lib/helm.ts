import { V1Pod } from "@kubernetes/client-node";
import { Ajv } from "ajv";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import type { App, Deployment, HelmConfig } from "../db/models.ts";
import { logger } from "../index.ts";
import { ValidationError } from "../service/common/errors.ts";
import {
  ensureNamespace,
  getClientForClusterUsername,
  resourceExists,
  svcK8s,
} from "./cluster/kubernetes.ts";
import { shouldImpersonate } from "./cluster/rancher.ts";
import { createNamespaceConfig } from "./cluster/resources.ts";
import { wrapWithLogExporter } from "./cluster/resources/logs.ts";
import { env } from "./env.ts";

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

let ajv: Ajv;
const initAjv = () => {
  if (!ajv) {
    ajv = new Ajv();
    try {
      const schema = JSON.parse(
        readFileSync("anvilops-values-schema.json").toString(),
      );
      ajv.addSchema(schema, "anvilops-values");
    } catch (e) {
      logger.warn(
        { error: e },
        "AnvilOps values validator could not be initialized",
      );
    }
  }
};

const fetchJSONFromChartRegistry = async <T>(
  path: string,
  init?: RequestInit,
) => {
  const res = await fetch(
    `${env.CHART_REGISTRY_PROTOCOL}://${env.CHART_REGISTRY_HOSTNAME}/${path}`,
    { ...init, signal: AbortSignal.timeout(5000) },
  );
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
};

export const getChartToken = async (): Promise<string> => {
  try {
    const { token } = await fetchJSONFromChartRegistry<{ token: string }>(
      `service/token?service=harbor-registry&scope=repository:${env.CHART_PROJECT_NAME}/charts:pull`,
    );
    return token;
  } catch (err) {
    logger.error(err, "Failed to get Helm chart pull token");
    throw new Error(`Failed to get Helm chart pull token: ${err}`);
  }
};

export async function getChartRepositories(): Promise<HarborRepository[]> {
  try {
    return await fetchJSONFromChartRegistry<HarborRepository[]>(
      `api/v2.0/projects/${env.CHART_PROJECT_NAME}/repositories`,
    );
  } catch (err) {
    logger.error(err, "Failed to get Helm chart repositories");
    throw new Error(`Failed to get Helm chart repositories: ${err}`);
  }
}

const getChart = async (
  repository: string,
  version: string,
  token: string,
): Promise<RegistryChart> => {
  let annotations: Record<string, string>;
  try {
    const res = await fetchJSONFromChartRegistry<{
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
    initAjv();
    try {
      anvilopsValues = JSON.parse(annotations["anvilops-values"]);
      if (!ajv.validate("anvilops-values", anvilopsValues)) {
        throw new Error(ajv.errors.toString());
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
};

export const getLatestChart = async (
  repository: string,
  token: string,
): Promise<RegistryChart | null> => {
  const chartTagList = await fetchJSONFromChartRegistry<ChartTagList>(
    `v2/${repository}/tags/list`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  return await getChart(
    chartTagList.name,
    chartTagList.tags[chartTagList.tags.length - 1],
    token,
  );
};

export const upgrade = async (
  app: App,
  deployment: Deployment,
  config: HelmConfig,
) => {
  const namespaceName = app.namespace;

  // Create namespace through Kubernetes API to ensure required Rancher annotations
  const api = getClientForClusterUsername(
    app.clusterUsername,
    "KubernetesObjectApi",
    shouldImpersonate(app.projectId),
  );
  const namespace = createNamespaceConfig(namespaceName, app.projectId);
  if (!(await resourceExists(api, namespace))) {
    try {
      await ensureNamespace(api, namespace);
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
              value: `${env.CLUSTER_INTERNAL_BASE_URL}/api`,
            },
            {
              name: "KUBECONFIG",
              value: "/opt/creds/kubeconfig",
            },
            {
              name: "HELM_KUBEASUSER",
              value: shouldImpersonate(app.projectId)
                ? app.clusterUsername
                : "",
            },
            {
              name: "HELM_ARGS",
              value: args.join("\n"),
            },
          ],
          name: "helm",
          image: env.HELM_DEPLOYER_IMAGE,
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
    await svcK8s["BatchV1Api"].createNamespacedJob({
      namespace: env.CURRENT_NAMESPACE,
      body: {
        metadata: {
          name: jobName,
          labels: {
            "anvilops.rcac.purdue.edu/app-id": app.id.toString(),
            "anvilops.rcac.purdue.edu/deployment-id": deployment.id.toString(),
          },
        },
        spec: {
          ttlSecondsAfterFinished: 5 * 60,
          backoffLimit: 1,
          activeDeadlineSeconds: 5 * 60,
          template: await wrapWithLogExporter(
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
};
