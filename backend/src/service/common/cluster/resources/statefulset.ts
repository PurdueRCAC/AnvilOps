import type { V1EnvVar, V1StatefulSet } from "@kubernetes/client-node";
import crypto from "node:crypto";
import { env } from "../../../../lib/env.ts";
import type { K8sObject } from "../resources.ts";
import type { LogCollectionService } from "./logs.ts";

interface DeploymentParams {
  deploymentId: number;
  collectLogs: boolean;
  name: string;
  namespace: string;
  serviceName: string;
  image: string;
  env: V1EnvVar[];
  logIngestSecret: string;
  subdomain: string;
  createIngress: boolean;
  port: number;
  replicas: number;
  mounts: PrismaJson.VolumeMount[];
  requests: PrismaJson.Resources;
  limits: PrismaJson.Resources;
}

export class StatefulSetConfigService {
  private logShipperWrapperService: LogCollectionService;

  constructor(logShipperWrapperService: LogCollectionService) {
    this.logShipperWrapperService = logShipperWrapperService;
  }

  async createStatefulSetConfig(
    params: DeploymentParams,
  ): Promise<V1StatefulSet & K8sObject> {
    const base: V1StatefulSet & K8sObject = {
      apiVersion: "apps/v1",
      kind: "StatefulSet",
      metadata: {
        name: params.name,
        namespace: params.namespace,
      },
      spec: {
        selector: {
          matchLabels: {
            app: params.name,
          },
        },
        serviceName: params.namespace,
        replicas: params.replicas,
        template: {
          metadata: {
            labels: {
              app: params.name,
            },
          },
          spec: {
            automountServiceAccountToken: false,
            imagePullSecrets: [{ name: "image-pull-secret" }],
            initContainers: [
              // Set to an empty array (instead of undefined) so that disabling collectLogs in an existing app
              // removes the initContainer that copies the log-shipper binary into the app container.
            ],
            volumes: [], // Same as above
            containers: [
              {
                name: params.name,
                image: params.image,
                imagePullPolicy: "Always",
                ports: [
                  {
                    containerPort: params.port,
                    protocol: "TCP",
                  },
                ],
                resources: {
                  requests: params.requests,
                  limits: params.limits,
                },
                env: params.env,
                volumeMounts: params.mounts.map((mount) => ({
                  mountPath: mount.path,
                  name: this.generateVolumeName(mount.path),
                })),
                lifecycle: {},
              },
            ],
          },
        },
        volumeClaimTemplates: params.mounts.map((mount) => ({
          metadata: { name: this.generateVolumeName(mount.path) },
          spec: {
            accessModes: env.STORAGE_ACCESS_MODES.split(","),
            storageClassName: env.STORAGE_CLASS_NAME,
            resources: { requests: { storage: `${mount.amountInMiB}Mi` } },
          },
        })),
        persistentVolumeClaimRetentionPolicy: {
          // Delete volumes when the StatefulSet is deleted, but not when it's scaled down
          whenDeleted: "Delete",
          whenScaled: "Retain",
        },
      },
    };
    if (params.collectLogs) {
      base.spec.template =
        await this.logShipperWrapperService.wrapWithLogExporter(
          "runtime",
          params.logIngestSecret,
          params.deploymentId,
          base.spec.template,
        );
    }

    return base;
  }

  generateVolumeName(mountPath: string) {
    // Volume names must be valid DNS labels (https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#dns-label-names)
    return (
      "anvilops-volume-" +
      crypto.createHash("md5").update(mountPath).digest("hex")
    );
  }
}
