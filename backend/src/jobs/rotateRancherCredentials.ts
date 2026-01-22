/* eslint-disable no-console */
import {
  AppsV1Api,
  CoreV1Api,
  KubeConfig,
  PatchStrategy,
  setHeaderOptions,
  type V1Deployment,
} from "@kubernetes/client-node";
import { exit } from "node:process";
import * as yaml from "yaml";

const RANCHER_API_BASE = process.env.RANCHER_API_BASE;
const RANCHER_TOKEN = process.env.RANCHER_TOKEN;
const RANCHER_SECRET_NAME = process.env.RANCHER_SECRET_NAME;
const RANCHER_TOKEN_TTL = parseInt(process.env.RANCHER_TOKEN_TTL, 10);

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
    ttl: RANCHER_TOKEN_TTL,
  }),
});

if (!rancherTokenReq.ok) {
  throw new Error(
    "Failed to generate rancher token: " + rancherTokenReq.statusText,
  );
}

const tokenRes = (await rancherTokenReq.json()) as {
  token: string;
};
const token = Buffer.from(tokenRes["token"], "utf-8").toString("base64");

await api.patchNamespacedSecret(
  {
    name: RANCHER_SECRET_NAME,
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
  if (!CLUSTER_ID) {
    console.log("CLUSTER_ID not set, skipping kubeconfig rotation");
  } else {
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

    const kubeConfigRes = (await kcReq.json()) as {
      baseType: "generateKubeConfigOutput";
      config: string;
      type: "generateKubeConfigOutput";
    };
    let kubeConfig = kubeConfigRes["config"];

    if (USE_CLUSTER_NAME) {
      const body = yaml.parse(kubeConfig) as object & {
        "current-context": string;
      };
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
}

const app = kc.makeApiClient(AppsV1Api);
const isDeploymentReady = async (deployment: V1Deployment) => {
  const deploy = await app.readNamespacedDeployment({
    name: deployment.metadata?.name,
    namespace: CURRENT_NAMESPACE,
  });
  return deploy.status?.updatedReplicas === deploy.status?.replicas;
};

// Restart the deployment
const deployment = await app.patchNamespacedDeployment(
  {
    name: "anvilops",
    namespace: CURRENT_NAMESPACE,
    body: {
      spec: {
        template: {
          metadata: {
            annotations: {
              "kubectl.kubernetes.io/restartedAt": new Date().toISOString(),
            },
          },
        },
      },
    },
  },
  setHeaderOptions("Content-Type", PatchStrategy.MergePatch),
);
console.log("Deployment restarted");

let ready = false;
const maxDelay = 5000;
const maxRetries = 8;
for (let i = 0; i < maxRetries; i++) {
  if (await isDeploymentReady(deployment)) {
    ready = true;
    break;
  }
  const delay = Math.min(500 * Math.pow(2, i), maxDelay);
  await new Promise((resolve) => setTimeout(resolve, delay));
}

if (!ready) {
  throw new Error("Timed out waiting for deployment to restart");
}

// Delete the previous Kubeconfig
if (KUBECONFIG_SECRET_NAME && CLUSTER_ID) {
  const oldKubeconfigName = kc.getCurrentUser().token.split(":")[0];
  await fetch(`${RANCHER_API_BASE}/tokens/${oldKubeconfigName}`, {
    method: "DELETE",
    headers: {
      Authorization: `Basic ${token}`,
      Accept: "application/json",
    },
  });
  console.log("Deleted previous Kubeconfig");
}

// Delete the previous Rancher token
const rancherTokenName = Buffer.from(RANCHER_TOKEN, "base64")
  .toString("utf-8")
  .split(":")[0];
await fetch(`${RANCHER_API_BASE}/tokens/${rancherTokenName}`, {
  method: "DELETE",
  headers: {
    Authorization: `Basic ${token}`,
    Accept: "application/json",
  },
});
console.log("Deleted previous Rancher token");
