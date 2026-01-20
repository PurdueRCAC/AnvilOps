import {
  CoreV1Api,
  KubeConfig,
  PatchStrategy,
  setHeaderOptions,
} from "@kubernetes/client-node";
import { exit } from "node:process";
import yaml from "yaml";

const KUBECONFIG_SECRET_NAME = process.env.KUBECONFIG_SECRET_NAME;
const CLUSTER_ID = process.env.CLUSTER_ID;
const USE_CLUSTER_NAME = process.env.USE_CLUSTER_NAME;

const RANCHER_API_BASE = process.env.RANCHER_API_BASE;
const RANCHER_TOKEN = process.env.RANCHER_TOKEN;
const CURRENT_NAMESPACE = process.env.CURRENT_NAMESPACE;

if (!RANCHER_API_BASE || !RANCHER_TOKEN) {
  console.log(
    "RANCHER_API_BASE or RANCHER_TOKEN not set, cannot get kubeconfig",
  );
  exit(1);
}

if (!CLUSTER_ID) {
  console.log("CLUSTER_ID not set, cannot get kubeconfig");
  exit(1);
}

const kcReq = await fetch(
  `${RANCHER_API_BASE}/clusters/${CLUSTER_ID}?action=generateKubeconfig`,
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

const kubeConfigRes = await kcReq.json();
let kubeConfig = kubeConfigRes["config"];

if (USE_CLUSTER_NAME) {
  const body = yaml.parse(kubeConfig);
  body["current-context"] = USE_CLUSTER_NAME;
  kubeConfig = yaml.stringify(body);
}

const kc = new KubeConfig();
kc.loadFromString(kubeConfig);

const api = kc.makeApiClient(CoreV1Api);

await api.patchNamespacedSecret(
  {
    name: KUBECONFIG_SECRET_NAME,
    namespace: CURRENT_NAMESPACE,
    body: {
      data: {
        kubeconfig: Buffer.from(kubeConfig, "utf-8").toString("base64"),
      },
    },
  },
  setHeaderOptions("Content-Type", PatchStrategy.MergePatch),
);

console.log("Kubeconfig patched successfully");
