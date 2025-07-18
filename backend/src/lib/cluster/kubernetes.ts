import {
  ApiException,
  AppsV1Api,
  BatchV1Api,
  CoreV1Api,
  KubeConfig,
  KubernetesObjectApi,
  Log,
  PatchStrategy,
  Watch,
  type V1Namespace,
} from "@kubernetes/client-node";
import type { K8sObject } from "./resources.ts";

const kc = new KubeConfig();
kc.loadFromDefault();

export const k8s = {
  default: kc.makeApiClient(CoreV1Api),
  apps: kc.makeApiClient(AppsV1Api),
  batch: kc.makeApiClient(BatchV1Api),
  full: KubernetesObjectApi.makeApiClient(kc),
  log: new Log(kc),
  watch: new Watch(kc),
};

export const namespaceInUse = async (namespace: string) => {
  return resourceExists({
    apiVersion: "v1",
    kind: "Namespace",
    metadata: { name: namespace },
  });
};

const resourceExists = async (data: K8sObject) => {
  try {
    await k8s.full.read(data);
    return true;
  } catch (err) {
    if (err instanceof ApiException) {
      // Assumes a namespace does not exist if request results in 403 Forbidden - potential false negative
      if ((data.kind === "Namespace" && err.code === 403) || err.code === 404) {
        return false;
      }
    }
    throw err;
  }
};

const REQUIRED_LABELS = [
  "field.cattle.io/projectId",
  "field.cattle.io/resourceQuota",
  "lifecycle.cattle.io/create.namespace-auth",
];
const ensureNamespace = async (namespace: V1Namespace & K8sObject) => {
  await k8s.default.createNamespace({ body: namespace });
  for (let i = 0; i < 20; i++) {
    try {
      const res: V1Namespace = await k8s.full.read(namespace);
      if (
        res.status.phase === "Active" &&
        REQUIRED_LABELS.every((label) =>
          res.metadata.annotations.hasOwnProperty(label),
        )
      ) {
        return;
      }
    } catch (err) {}

    await new Promise((r) => setTimeout(r, 200));
  }

  throw new Error("Timed out waiting for namespace to create");
};

export const deleteNamespace = async (namespace: string) => {
  await k8s.default.deleteNamespace({
    name: namespace,
  });
  console.log(`Namespace ${namespace} deleted`);
};

export const createOrUpdateApp = async (
  name: string,
  namespace: V1Namespace & K8sObject,
  configs: K8sObject[],
  postCreate?: () => void,
) => {
  if (!(await resourceExists(namespace))) {
    await ensureNamespace(namespace);
  }

  for (let config of configs) {
    if (await resourceExists(config)) {
      await k8s.full.patch(
        config,
        undefined,
        undefined,
        undefined,
        undefined,
        PatchStrategy.MergePatch, // The default is PatchStrategy.StrategicMergePatch, which can target individual array items, but it doesn't work with custom resources (we're using `flow` and `output` from the kube-logging operator).
      );
    } else {
      await k8s.full.create(config);
    }
  }

  postCreate?.();
  console.log(`App ${name} updated`);
};
