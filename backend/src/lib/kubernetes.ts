import { BatchV1Api, CoreV1Api, KubeConfig } from "@kubernetes/client-node";

const kc = new KubeConfig();
kc.loadFromDefault();

export const k8s = kc.makeApiClient(CoreV1Api);
export const k8s_batch = kc.makeApiClient(BatchV1Api);
