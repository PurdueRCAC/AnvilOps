import { ApiException } from "@kubernetes/client-node";
import { env } from "../../env.ts";
import { svcK8s } from "../kubernetes.ts";
import type { K8sObject } from "../resources.ts";

/**
 * Creates the configuration needed for the kube-logging operator to forward logs from the user's pod to our backend.
 */
export const createLogConfig = async (
  namespace: string,
  appId: number,
  secret: string,
): Promise<K8sObject[]> => {
  try {
    await svcK8s.ExtensionsV1Api.readCustomResourceDefinition({
      name: "flows.logging.banzaicloud.io",
    });
  } catch (e) {
    if (e instanceof ApiException && e.code === 404) {
      // The logging operator is not installed; these resources can't be installed on the cluster.
      return [];
    }
    throw e;
  }

  return [
    {
      apiVersion: "v1",
      kind: "Secret",
      metadata: {
        name: "anvilops-internal-logging-ingest",
        namespace,
      },
      stringData: {
        secret: secret,
      },
    },
    {
      apiVersion: "logging.banzaicloud.io/v1beta1",
      kind: "Flow",
      metadata: {
        name: `${namespace}-log-flow`,
        namespace,
      },
      spec: {
        match: [
          {
            select: {
              labels: {
                "anvilops.rcac.purdue.edu/collect-logs": "true",
              },
            },
          },
        ],
        localOutputRefs: [`${namespace}-log-output`],
      },
    },
    {
      apiVersion: "logging.banzaicloud.io/v1beta1",
      kind: "Output",
      metadata: {
        name: `${namespace}-log-output`,
        namespace,
      },
      spec: {
        http: {
          // https://kube-logging.dev/docs/configuration/plugins/outputs/http/
          endpoint: `${env.CLUSTER_INTERNAL_BASE_URL}/api/logs/ingest?type=runtime&appId=${appId}`,
          auth: {
            username: {
              value: "anvilops",
            },
            password: {
              // https://kube-logging.dev/docs/configuration/plugins/outputs/secret/
              valueFrom: {
                secretKeyRef: {
                  name: "anvilops-internal-logging-ingest",
                  key: "secret",
                },
              },
            },
          },
          content_type: "application/jsonl",
          buffer: {
            type: "memory",
            tags: "time",
            timekey: "1s",
            timekey_wait: "0s",
            flush_mode: "interval",
            flush_interval: "1s",
          },
        },
      },
    },
  ];
};
