/* eslint-disable no-console */
import {
  CoreV1Api,
  KubeConfig,
  PatchStrategy,
  setHeaderOptions,
  type Cluster,
} from "@kubernetes/client-node";
import fs from "node:fs";
import { exit } from "node:process";

const KUBECONFIG_SECRET_NAME = process.env.KUBECONFIG_SECRET_NAME;
const CLUSTER_ID = process.env.CLUSTER_ID;
const USE_CLUSTER_NAME = process.env.USE_CLUSTER_NAME;

const RANCHER_BASE_URL = process.env.RANCHER_BASE_URL;
const RANCHER_TOKEN = process.env.RANCHER_TOKEN;
const CURRENT_NAMESPACE = process.env.CURRENT_NAMESPACE;

if (!RANCHER_BASE_URL || !RANCHER_TOKEN) {
  console.log(
    "RANCHER_BASE_URL or RANCHER_TOKEN not set, cannot get kubeconfig",
  );
  exit(1);
}

if (!CLUSTER_ID) {
  console.log("CLUSTER_ID not set, cannot get kubeconfig");
  exit(1);
}

const kcReq = await fetch(
  `${RANCHER_BASE_URL}/v3/clusters/${CLUSTER_ID}?action=generateKubeconfig`,
  {
    method: "POST",
    headers: {
      Authorization: `Basic ${RANCHER_TOKEN}`,
      Accept: "application/json",
    },
  },
);

if (!kcReq.ok) {
  throw new Error("Failed to get kubeconfig: " + kcReq.statusText);
}

const kubeConfigRes = (await kcReq.json()) as {
  baseType: "generateKubeConfigOutput";
  config: string;
  type: "generateKubeConfigOutput";
};
const kubeConfig = kubeConfigRes.config;
const kc = new KubeConfig();
kc.loadFromString(kubeConfig);

if (USE_CLUSTER_NAME) {
  kc.setCurrentContext(USE_CLUSTER_NAME);
}

if (process.env.NODE_EXTRA_CA_CERTS) {
  const rancherCA = fs.readFileSync(process.env.NODE_EXTRA_CA_CERTS, "utf8");
  const cluster = kc.getCurrentCluster() as Cluster & { caData: string };
  cluster.caData = Buffer.from(rancherCA, "utf8").toString("base64");
}

const api = kc.makeApiClient(CoreV1Api);
await api.patchNamespacedSecret(
  {
    name: KUBECONFIG_SECRET_NAME,
    namespace: CURRENT_NAMESPACE,
    body: {
      data: {
        kubeconfig: Buffer.from(kc.exportConfig(), "utf-8").toString("base64"),
      },
    },
  },
  setHeaderOptions("Content-Type", PatchStrategy.MergePatch),
);

console.log("Kubeconfig patched successfully");
