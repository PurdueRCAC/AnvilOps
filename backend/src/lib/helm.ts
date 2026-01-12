import { V1Pod } from "@kubernetes/client-node";
import { spawn } from "child_process";
import { randomBytes } from "node:crypto";
import { parse as yamlParse } from "yaml";
import type { App, Deployment, HelmConfig } from "../db/models.ts";
import { svcK8s } from "./cluster/kubernetes.ts";
import { shouldImpersonate } from "./cluster/rancher.ts";
import { getNamespace } from "./cluster/resources.ts";
import { wrapWithLogExporter } from "./cluster/resources/logs.ts";
import { env } from "./env.ts";

type Dependency = {
  name: string;
  version: string;
  repository?: string;
  condition?: string;
  tags?: string[];
  "import-values"?: string;
  alias?: string;
};

type Chart = {
  apiVersion: string;
  name: string;
  version: string;
  kubeVersion?: string;
  description?: string;
  type?: string;
  keywords?: string[];
  home?: string;
  sources?: string[];
  dependencies?: Dependency[];
  maintainers?: { name: string; email: string; url: string }[];
  icon?: string;
  appVersion?: string;
  deprecated?: boolean;
  annotations?: Record<string, string>;
};

const runHelm = (args: string[]) => {
  return new Promise((resolve, reject) => {
    const p = spawn("helm", args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "",
      err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) =>
      code === 0 ? resolve(out) : reject(new Error(err || `helm exit ${code}`)),
    );
  });
};

export const getChart = async (
  url: string,
  version?: string,
): Promise<Chart> => {
  const args = ["show", "chart"];
  if (version) {
    args.push("version", version);
  }
  args.push(url);

  const result = (await runHelm(args)) as string;
  const chart = (await yamlParse(result)) as Chart;
  return chart;
};

export const upgrade = async (
  app: App,
  deployment: Deployment,
  config: HelmConfig,
) => {
  const args = [
    "upgrade",
    "--install",
    "--namespace",
    getNamespace(app.namespace),
    "--create-namespace",
  ];

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
