import {
  AppsV1Api,
  BatchV1Api,
  CoreV1Api,
  KubeConfig,
} from "@kubernetes/client-node";

const kc = new KubeConfig();
kc.loadFromDefault();

export const k8s = {
  default: kc.makeApiClient(CoreV1Api),
  apps: kc.makeApiClient(AppsV1Api),
  batch: kc.makeApiClient(BatchV1Api),
};
