import {
  CoreV1Api,
  KubeConfig,
  PatchStrategy,
  setHeaderOptions,
} from "@kubernetes/client-node";
import { exit } from "node:process";
import * as yaml from "yaml";

const RANCHER_API_BASE = process.env.RANCHER_API_BASE;
const RANCHER_TOKEN = process.env.RANCHER_TOKEN;

if (!RANCHER_API_BASE || !RANCHER_TOKEN) {
  console.log("RANCHER_API_BASE or RANCHER_TOKEN not set, skipping rotation");
  exit(1);
}

const KUBECONFIG_SECRET_NAME = process.env.KUBECONFIG_SECRET_NAME;
const CURRENT_NAMESPACE = process.env.CURRENT_NAMESPACE;
const USE_CLUSTER_NAME = process.env.USE_CLUSTER_NAME;
const CLUSTER_ID = process.env.CLUSTER_ID;

const kc = new KubeConfig();
kc.loadFromDefault();

const api = kc.makeApiClient(CoreV1Api);

const rancherTokenReq = await fetch(`${RANCHER_API_BASE}/tokens`, {
  method: "POST",
  headers: {
    Authorization: `Basic ${RANCHER_TOKEN}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    type: "token",
    ttl: 2592000000, // 30 days
  }),
});

if (!rancherTokenReq.ok) {
  throw new Error(
    "Failed to generate rancher token: " + rancherTokenReq.statusText,
  );
}

const tokenRes = await rancherTokenReq.json();
const token = Buffer.from(tokenRes["token"], "utf-8").toString("base64");

await api.patchNamespacedSecret(
  {
    name: "rancher-config",
    namespace: CURRENT_NAMESPACE,
    body: {
      data: {
        "api-token": Buffer.from(token, "utf-8").toString("base64"),
      },
    },
  },
  setHeaderOptions("Content-Type", PatchStrategy.MergePatch),
);

console.log("Rancher token patched successfully");

if (KUBECONFIG_SECRET_NAME) {
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
    throw new Error("Failed to regenerate kubeconfig: " + kcReq.statusText);
  }

  const kubeConfigRes = await kcReq.json();
  let kubeConfig = kubeConfigRes["config"];

  if (USE_CLUSTER_NAME) {
    const body = yaml.parse(kubeConfig);
    body["current-context"] = USE_CLUSTER_NAME;
    kubeConfig = yaml.stringify(body);
  }

  await api.patchNamespacedSecret(
    {
      name: KUBECONFIG_SECRET_NAME,
      namespace: process.env.CURRENT_NAMESPACE,
      body: {
        data: {
          kubeconfig: Buffer.from(kubeConfig, "utf-8").toString("base64"),
        },
      },
    },
    setHeaderOptions("Content-Type", PatchStrategy.MergePatch),
  );

  console.log("Kubeconfig patched successfully");
}
