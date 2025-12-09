import type { V1EnvVar, V1StatefulSet } from "@kubernetes/client-node";
import crypto from "node:crypto";
import type { Octokit } from "octokit";
import type {
  App,
  Deployment,
  DeploymentConfig,
} from "../../../generated/prisma/client.ts";
import { env } from "../../env.ts";
import { getRepoById } from "../../octokit.ts";
import type { K8sObject } from "../resources.ts";
import { wrapWithLogExporter } from "./logs.ts";

interface DeploymentParams {
  deploymentId: number;
  collectLogs: boolean;
  name: string;
  namespace: string;
  serviceName: string;
  image: string;
  env: V1EnvVar[];
  logIngestSecret: string;
  subdomain: string;
  createIngress: boolean;
  port: number;
  replicas: number;
  mounts: PrismaJson.VolumeMount[];
  requests: PrismaJson.Resources;
  limits: PrismaJson.Resources;
}

export const generateAutomaticEnvVars = async (
  octokit: Octokit | null,
  deployment: Pick<Deployment, "id" | "commitMessage"> & {
    config: Pick<
      DeploymentConfig,
      | "source"
      | "branch"
      | "imageTag"
      | "repositoryId"
      | "commitHash"
      | "port"
      | "subdomain"
      | "createIngress"
    >;
    app: Pick<App, "id" | "namespace" | "displayName">;
  },
): Promise<{ name: string; value: string }[]> => {
  const app = deployment.app;
  const appDomain = URL.parse(env.APP_DOMAIN);
  const list = [
    {
      name: "PORT",
      value: deployment.config.port.toString(),
      isSensitive: false,
    },
    {
      name: "ANVILOPS_CLUSTER_HOSTNAME",
      value: `anvilops-${app.namespace}.anvilops-${app.namespace}.svc.cluster.local`,
    },
    {
      name: "ANVILOPS_APP_NAME",
      value: app.displayName,
    },
    // {
    //   name: "ANVILOPS_SUBDOMAIN",
    //   value: app.subdomain,
    // },
    {
      name: "ANVILOPS_APP_ID",
      value: app.id.toString(),
    },
    {
      name: "ANVILOPS_DEPLOYMENT_ID",
      value: deployment.id.toString(),
    },
    {
      name: "ANVILOPS_DEPLOYMENT_SOURCE",
      value: deployment.config.source,
    },
    {
      name: "ANVILOPS_IMAGE_TAG",
      value: deployment.config.imageTag,
    },
  ];

  if (octokit && deployment.config.source === "GIT") {
    const repo = await getRepoById(octokit, deployment.config.repositoryId);
    list.push({
      name: "ANVILOPS_REPOSITORY_ID",
      value: deployment.config.repositoryId.toString(),
    });
    list.push({ name: "ANVILOPS_REPOSITORY_OWNER", value: repo.owner.login });
    list.push({ name: "ANVILOPS_REPOSITORY_NAME", value: repo.name });
    list.push({
      name: "ANVILOPS_REPOSITORY_SLUG",
      value: `${repo.owner.login}/${repo.name}`,
    });
    list.push({
      name: "ANVILOPS_COMMIT_HASH",
      value: deployment.config.commitHash,
    });
    list.push({
      name: "ANVILOPS_COMMIT_MESSAGE",
      value: deployment.commitMessage,
    });
  }

  if (appDomain !== null && deployment.config.createIngress) {
    const hostname = `${deployment.config.subdomain}.${appDomain.host}`;
    list.push({
      name: "ANVILOPS_HOSTNAME",
      value: hostname,
    });
    list.push({
      name: "ANVILOPS_URL",
      value: new URL(`${appDomain.protocol}//${hostname}`).toString(),
    });
  }

  return list;
};

export const generateVolumeName = (mountPath: string) => {
  // Volume names must be valid DNS labels (https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#dns-label-names)
  return (
    "anvilops-volume-" +
    crypto.createHash("md5").update(mountPath).digest("hex")
  );
};

export const createStatefulSetConfig = async (
  params: DeploymentParams,
): Promise<V1StatefulSet & K8sObject> => {
  let base: V1StatefulSet & K8sObject = {
    apiVersion: "apps/v1",
    kind: "StatefulSet",
    metadata: {
      name: params.name,
      namespace: params.namespace,
    },
    spec: {
      selector: {
        matchLabels: {
          app: params.name,
        },
      },
      serviceName: params.namespace,
      replicas: params.replicas,
      template: {
        metadata: {
          labels: {
            app: params.name,
          },
        },
        spec: {
          automountServiceAccountToken: false,
          initContainers: [
            // Set to an empty array (instead of undefined) so that disabling collectLogs in an existing app
            // removes the initContainer that copies the log-shipper binary into the app container.
          ],
          volumes: [], // Same as above
          containers: [
            {
              name: params.name,
              image: params.image,
              imagePullPolicy: "Always",
              ports: [
                {
                  containerPort: params.port,
                  protocol: "TCP",
                },
              ],
              resources: {
                requests: params.requests,
                limits: params.limits,
              },
              env: params.env,
              volumeMounts: params.mounts.map((mount) => ({
                mountPath: mount.path,
                name: generateVolumeName(mount.path),
              })),
              lifecycle: {},
            },
          ],
        },
      },
      volumeClaimTemplates: params.mounts.map((mount) => ({
        metadata: { name: generateVolumeName(mount.path) },
        spec: {
          accessModes: env.STORAGE_ACCESS_MODES.split(","),
          storageClassName: env.STORAGE_CLASS_NAME,
          resources: { requests: { storage: `${mount.amountInMiB}Mi` } },
        },
      })),
      persistentVolumeClaimRetentionPolicy: {
        // Delete volumes when the StatefulSet is deleted, but not when it's scaled down
        whenDeleted: "Delete",
        whenScaled: "Retain",
      },
    },
  };
  if (params.collectLogs) {
    base.spec.template = await wrapWithLogExporter(
      "runtime",
      params.logIngestSecret,
      params.deploymentId,
      base.spec.template,
    );
  }

  return base;
};
