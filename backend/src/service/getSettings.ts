import { readFile } from "node:fs/promises";
import { isRancherManaged } from "../lib/cluster/rancher.ts";
import { env } from "../lib/env.ts";

type ClusterConfig = {
  name?: string;
  faq?: {
    question?: string;
    answer?: string;
    link?: string;
  };
};

let clusterConfigPromise: Promise<ClusterConfig> | null = null;

const configPath =
  env["NODE_ENV"] === "development"
    ? "./cluster.local.json"
    : env.CLUSTER_CONFIG_PATH;

if (configPath) {
  clusterConfigPromise = readFile(configPath).then(
    (file) => JSON.parse(file.toString()) as ClusterConfig,
  );
}

export async function getSettings() {
  const clusterConfig = await clusterConfigPromise;

  return {
    appDomain: env.INGRESS_CLASS_NAME ? env.APP_DOMAIN : undefined,
    version: getVersionString(),
    clusterName: clusterConfig?.name,
    faq: clusterConfig?.faq,
    storageEnabled: env.STORAGE_CLASS_NAME !== undefined,
    isRancherManaged: isRancherManaged(),
    allowHelmDeployments: env.ALLOW_HELM_DEPLOYMENTS === "true",
  };
}

function getVersionString() {
  let version = env.ANVILOPS_VERSION;
  if (env.BUILD_DATE) {
    version += " (" + new Date(env.BUILD_DATE).toLocaleDateString() + ")";
  }

  if (env.IN_TILT) {
    version += " (dev)";
  }
  return version;
}
