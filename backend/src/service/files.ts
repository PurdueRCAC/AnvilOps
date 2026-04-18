import type { ApiException, V1Job } from "@kubernetes/client-node";
import crypto, { randomBytes } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import type { AppRepo } from "../db/repo/app.ts";
import { env } from "../lib/env.ts";
import { logger } from "../logger.ts";
import type { KubernetesClientService } from "./common/cluster/kubernetes.ts";
import type { StatefulSetConfigService } from "./common/cluster/resources/statefulset.ts";
import {
  AppNotFoundError,
  IllegalPVCAccessError,
  ValidationError,
} from "./errors/index.ts";

export class FileBrowserService {
  private appRepo: AppRepo;
  private statefulSetConfigService: StatefulSetConfigService;
  private kubernetesService: KubernetesClientService;

  constructor(
    appRepo: AppRepo,
    statefulSetConfigService: StatefulSetConfigService,
    kubernetesService: KubernetesClientService,
  ) {
    this.appRepo = appRepo;
    this.statefulSetConfigService = statefulSetConfigService;
    this.kubernetesService = kubernetesService;
  }

  async forwardToFileBrowser(
    userId: number,
    appId: number,
    volumeClaimName: string,
    path: string,
    requestInit: RequestInit,
  ) {
    const app = await this.appRepo.getById(appId, {
      requireUser: { id: userId },
    });

    if (!app) {
      throw new AppNotFoundError();
    }

    const config = await this.appRepo.getDeploymentConfig(appId);

    if (config.appType !== "workload") {
      throw new ValidationError(
        "File browsing is supported only for Git and image deployments",
      );
    }

    if (
      !config.mounts.some((mount) =>
        volumeClaimName.startsWith(
          this.statefulSetConfigService.generateVolumeName(mount.path) + "-",
        ),
      )
    ) {
      // This persistent volume doesn't belong to the application
      throw new IllegalPVCAccessError();
    }

    const response = await this.forwardRequest(
      app.namespace,
      volumeClaimName,
      path,
      requestInit,
    );

    return response;
  }

  async forwardRequest(
    namespace: string,
    volumeClaimName: string,
    urlPath: string,
    request: RequestInit,
  ): Promise<Response> {
    const { address, code } = await this.getFileBrowserAddress(
      namespace,
      volumeClaimName,
    );
    return await fetch(address + urlPath, {
      ...request,
      headers: { ...request.headers, authorization: code },
    });
  }

  async getFileBrowserAddress(namespace: string, volumeClaimName: string) {
    const jobName = `anvilops-file-browser-${crypto.createHash("md5").update(volumeClaimName).digest("hex")}`;

    const volume =
      await this.kubernetesService.readNamespacedPersistentVolumeClaim({
        namespace,
        name: volumeClaimName,
      });

    const volumeName = volume.spec.volumeName;

    if (!volumeName) {
      throw new Error("Volume not found");
    }

    try {
      const pods = await this.kubernetesService.listNamespacedPod({
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
      if ((err as ApiException<unknown>).code !== 404) {
        throw new Error("Failed to read file browser job", { cause: err });
      }
    }

    let job: V1Job;
    try {
      job = await this.kubernetesService.createNamespacedJob({
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
                        scheme: "HTTP",
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
                    securityContext: {
                      capabilities: {
                        drop: ["ALL"],
                      },
                      runAsNonRoot: true,
                      runAsUser: 65532,
                      runAsGroup: 65532,
                      readOnlyRootFilesystem: true,
                      allowPrivilegeEscalation: false,
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
      logger.info(
        { jobName: job.metadata.name, jobNamespace: job.metadata.namespace },
        "Created file browser pod",
      );
    } catch (error) {
      if ((error as ApiException<unknown>).code === 409) {
        // A Job with this name already exists in this namespace. We don't need to recreate it.
      } else {
        throw error;
      }
    }

    for (let i = 0; i < 30; i++) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const pods = await this.kubernetesService.listNamespacedPod({
          namespace,
          labelSelector: `batch.kubernetes.io/job-name=${jobName}`,
        });
        if (pods.items.length === 0) {
          continue;
        }
        const pod = pods.items[0];
        if (pod?.status?.phase === "Running" && pod?.status?.podIP) {
          logger.info(
            {
              jobName: job.metadata.name,
              jobNamespace: job.metadata.namespace,
              address: pod.status.podIP,
            },
            "File browser pod started",
          );
          return {
            address: `http://${pod.status.podIP}:8080`,
            code: pod.spec.containers[0].env[0].value,
          };
        }
      } catch (err) {
        if ((err as ApiException<unknown>).code !== 404) {
          throw new Error("Failed to find file browser pod", { cause: err });
        }
      }
      // eslint-disable-next-line no-await-in-loop
      await setTimeout(500);
    }

    throw new Error("Timed out waiting for file browser to start up");
  }
}
