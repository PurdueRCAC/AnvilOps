import { env } from "../../env.ts";
import type { K8sObject } from "../resources.ts";

/**
 * Creates the configuration needed for the kube-logging operator to forward logs from the user's pod to our backend.
 */
export const createLogConfig = (
  namespace: string,
  appId: number,
  secret: string,
): K8sObject[] => {
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
            flush_mode: "immediate",
            flush_interval: "1s",
          },
        },
      },
    },
  ];
};
