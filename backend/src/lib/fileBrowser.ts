import type { ApiException, V1Job } from "@kubernetes/client-node";
import crypto, { randomBytes } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { svcK8s } from "./cluster/kubernetes.ts";
import { env } from "./env.ts";

export async function forwardRequest(
  namespace: string,
  volumeClaimName: string,
  urlPath: string,
  request: RequestInit,
): Promise<Response> {
  const { address, code } = await getFileBrowserAddress(
    namespace,
    volumeClaimName,
  );
  return await fetch(address + urlPath, {
    ...request,
    headers: { ...request.headers, authorization: code },
  });
}

async function getFileBrowserAddress(
  namespace: string,
  volumeClaimName: string,
) {
  const jobName = `anvilops-file-browser-${crypto.createHash("md5").update(volumeClaimName).digest("hex")}`;

  const volume = await svcK8s["CoreV1Api"].readNamespacedPersistentVolumeClaim({
    namespace,
    name: volumeClaimName,
  });

  const volumeName = volume.spec.volumeName;

  if (!volumeName) {
    throw new Error("Volume not found");
  }

  try {
    const pods = await svcK8s["CoreV1Api"].listNamespacedPod({
      namespace,
      labelSelector: `batch.kubernetes.io/job-name=${jobName}`,
    });
    if (pods.items.length > 0) {
      const pod = pods.items[0];
      if (pod?.status?.phase === "Running" && pod?.status?.podIP) {
        return {
          address: `http://${pod.status.podIP}:8080`,
          code: pod.spec.containers[0].env[0].value,
        };
      }
    }
  } catch (err) {
    if ((err as ApiException<any>).code !== 404) {
      throw new Error("Failed to read file browser job", { cause: err });
    }
  }

  let job: V1Job;
  try {
    job = await svcK8s["BatchV1Api"].createNamespacedJob({
      namespace,
      body: {
        metadata: {
          name: jobName,
        },
        spec: {
          ttlSecondsAfterFinished: 0, // Delete job immediately after it exits
          backoffLimit: 0, // Don't restart the pod if it crashes
          activeDeadlineSeconds: 30 * 60, // Kill after 30 minutes
          template: {
            spec: {
              containers: [
                {
                  name: "file-browser",
                  image: env.FILE_BROWSER_IMAGE,
                  imagePullPolicy: "Always",
                  volumeMounts: [
                    {
                      mountPath: "/files",
                      name: jobName + "-vol",
                    },
                  ],
                  ports: [{ containerPort: 8080 }],
                  env: [
                    {
                      name: "AUTH_TOKEN",
                      value: randomBytes(48).toString("hex"),
                    },
                  ],
                  livenessProbe: {
                    initialDelaySeconds: 3,
                    periodSeconds: 3,
                    timeoutSeconds: 1,
                    failureThreshold: 3,
                    httpGet: {
                      port: 8080,
                      path: "/livez",
                      scheme: "http",
                    },
                  },
                  resources: {
                    limits: {
                      cpu: "500m",
                      memory: "500Mi",
                    },
                    requests: {
                      cpu: "250m",
                      memory: "128Mi",
                    },
                  },
                },
              ],
              volumes: [
                {
                  name: jobName + "-vol",
                  persistentVolumeClaim: {
                    claimName: volumeClaimName,
                  },
                },
              ],
              restartPolicy: "Never",
            },
          },
        },
      },
    });
  } catch (error) {
    if ((error as ApiException<any>).code === 409) {
      // A Job with this name already exists in this namespace. We don't need to recreate it.
    } else {
      throw error;
    }
  }

  for (let i = 0; i < 30; i++) {
    try {
      const pods = await svcK8s["CoreV1Api"].listNamespacedPod({
        namespace,
        labelSelector: `batch.kubernetes.io/job-name=${jobName}`,
      });
      if (pods.items.length === 0) {
        continue;
      }
      const pod = pods.items[0];
      if (pod?.status?.phase === "Running" && pod?.status?.podIP) {
        return {
          address: `http://${pod.status.podIP}:8080`,
          code: pod.spec.containers[0].env[0].value,
        };
      }
    } catch (err) {
      if ((err as ApiException<any>).code !== 404) {
        throw new Error("Failed to find file browser pod", { cause: err });
      }
    }
    await setTimeout(500);
  }

  throw new Error("Timed out waiting for file browser to start up");
}
