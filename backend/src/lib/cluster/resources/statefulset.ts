import type { V1EnvVar, V1StatefulSet } from "@kubernetes/client-node";
import jsonpatch from "fast-json-patch";
import crypto from "node:crypto";
import { env } from "../../env.ts";
import type { K8sObject } from "../resources.ts";

export type DeploymentParams = {
  name: string;
  namespace: string;
  serviceName: string;
  image: string;
  env: V1EnvVar[];
} & PrismaJson.ConfigFields;

export const generateVolumeName = (mountPath: string) => {
  // Volume names must be valid DNS labels (https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#dns-label-names)
  return (
    "anvilops-volume-" +
    crypto.createHash("md5").update(mountPath).digest("hex")
  );
};

export const createStatefulSetConfig = (
  params: DeploymentParams,
): V1StatefulSet & K8sObject => {
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
            "anvilops.rcac.purdue.edu/collect-logs": "true",
          },
        },
        spec: {
          automountServiceAccountToken: false,
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
              // Parent paths of a JSON patch must exist for the patch to work without error
              resources: {},
              env: params.env,
              volumeMounts: params.mounts.map((mount) => ({
                mountPath: mount.path,
                name: generateVolumeName(mount.path),
              })),
              lifecycle: {},
            },
          ],
        },
      },
      volumeClaimTemplates: params.mounts.map((mount) => ({
        metadata: { name: generateVolumeName(mount.path) },
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

  return applyPatches(base, getExtraStsPatches(params.extra));
};

const StsExtraPatchPaths: Record<
  keyof PrismaJson.ConfigFields["extra"],
  string[]
> = {
  postStart: ["/spec/template/spec/containers/0/lifecycle/postStart"],
  preStop: ["/spec/template/spec/containers/0/lifecycle/preStop"],
  limits: ["/spec/template/spec/containers/0/resources/limits"],
  requests: ["/spec/template/spec/containers/0/resources/requests"],
};

const getExtraStsPatches = (
  fields: PrismaJson.ConfigFields["extra"],
): jsonpatch.Operation[] => {
  const patches = [] as jsonpatch.Operation[];
  for (const [key, value] of Object.entries(fields)) {
    if (!fields[key]) continue;

    const field = key as keyof PrismaJson.ConfigFields["extra"];
    switch (field) {
      case "postStart":
      case "preStop": {
        patches.push(
          ...StsExtraPatchPaths[field].map(
            (path) =>
              ({
                op: "add",
                path,
                value: {
                  exec: {
                    command: ["/bin/sh", "-c", value],
                  },
                },
              }) satisfies jsonpatch.Operation,
          ),
        );
        break;
      }
      default: {
        patches.push(
          ...StsExtraPatchPaths[field].map(
            (path) =>
              ({ op: "add", path, value }) satisfies jsonpatch.Operation,
          ),
        );
      }
    }
  }

  return patches;
};

function applyPatches<T extends object>(
  document: T,
  patches: jsonpatch.Operation[],
): T {
  try {
    return jsonpatch.applyPatch(document, patches).newDocument as T;
  } catch (err) {
    console.error(err);
  }
}
