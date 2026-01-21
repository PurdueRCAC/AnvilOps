import { V1Pod } from "@kubernetes/client-node";
import { randomBytes } from "node:crypto";
import type { App, Deployment, HelmConfig } from "../db/models.ts";
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

type Chart = {
  name: string;
  version: string;
  description?: string;
  note?: string;
  values: Record<string, any>;
};

type ChartTagList = {
  name: string;
  tags: string[];
};

export const getChartToken = async () => {
  return fetch(
    `${env.REGISTRY_PROTOCOL}://${env.REGISTRY_HOSTNAME}/v2/service/token?service=harbor-registry&scope=repository:${env.CHART_PROJECT_NAME}/charts:pull`,
  )
    .then((res) => {
      if (!res.ok) {
        console.error(res);
        throw new Error(res.statusText);
      }
      return res;
    })
    .then((res) => res.text())
    .then((res) => JSON.parse(res))
    .then((res) => {
      return res.token;
    });
};

const getChart = async (
  repository: string,
  version: string,
  token: string,
): Promise<Chart> => {
  return fetch(
    `${env.REGISTRY_PROTOCOL}://${env.REGISTRY_HOSTNAME}/v2/${repository}/manifests/${version}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.oci.image.manifest.v1+json",
      },
    },
  )
    .then((res) => {
      if (!res.ok) {
        throw new Error(res.statusText);
      }
      return res;
    })
    .then((res) => res.text())
    .then((res) => JSON.parse(res))
    .then((res) => {
      const annotations = res.annotations;
      if ("anvilops-values" in annotations) {
        return {
          name: annotations["org.opencontainers.image.title"],
          version: annotations["org.opencontainers.image.version"],
          description: annotations["org.opencontainers.image.description"],
          note: annotations["anvilops-note"],
          values: JSON.parse(annotations["anvilops-values"]),
        };
      } else {
        return null;
      }
    });
};

export const getLatestChart = async (
  repository: string,
  token: string,
): Promise<Chart | null> => {
  const chartTagList = await fetch(
    `${env.REGISTRY_PROTOCOL}://${env.REGISTRY_HOSTNAME}/v2/${repository}/tags/list`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  )
    .then((res) => {
      if (!res.ok) {
        throw new Error(res.statusText);
      }
      return res;
    })
    .then((res) => res.json() as Promise<ChartTagList>);

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
      throw new Error(
        `Failed to create namespace ${namespaceName}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const args = ["upgrade", "--install", "--namespace", namespaceName];

  const { urlType, url, version, values } = config;
  const release = app.name;

  for (const [key, value] of Object.entries(values)) {
    args.push("--set-json", `${key}=${JSON.stringify(value)}`);
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
              value: `${args.join(" ")}`,
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
    console.error(e);
    throw e;
  }
};
