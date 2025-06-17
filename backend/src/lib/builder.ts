import { randomBytes } from "node:crypto";
import type { DeploymentConfigCreateWithoutDeploymentInput } from "../generated/prisma/models.ts";
import { k8s } from "./kubernetes.ts";

type ImageTag = `${string}/${string}/${string}:${string}`;

export async function createBuildJob({
  tag,
  gitRepoURL,
  imageTag,
  imageCacheTag,
  deploymentSecret,
  ref,
  deploymentId,
  config,
}: {
  tag: string;
  gitRepoURL: string;
  imageTag: ImageTag;
  imageCacheTag: ImageTag;
  deploymentSecret: string;
  ref: string;
  deploymentId: number;
  config: DeploymentConfigCreateWithoutDeploymentInput;
}) {
  if (!["dockerfile", "railpack"].includes(config.builder)) {
    throw new Error(
      "Invalid builder: " +
        config.builder +
        ". Expected dockerfile or railpack.",
    );
  }

  const label = randomBytes(4).toString("hex");

  const job = await k8s.batch.createNamespacedJob({
    namespace: "anvilops-dev",
    body: {
      metadata: {
        name: `build-image-${tag}-${label}`,
        labels: {
          "anvilops.rcac.purdue.edu/deployment-id": deploymentId.toString(),
        },
      },
      spec: {
        ttlSecondsAfterFinished: 3 * 60 * 60, // Delete jobs 3 hours after they complete
        backoffLimit: 1, // Retry builds up to 1 time if they exit with a non-zero status code
        activeDeadlineSeconds: 30 * 60, // Kill builds after 30 minutes
        template: {
          metadata: {
            labels: {
              "anvilops.rcac.purdue.edu/deployment-id": deploymentId.toString(),
              "anvilops.rcac.purdue.edu/collect-logs": "true",
            },
          },
          spec: {
            containers: [
              {
                name: "builder",
                image: `registry.anvil.rcac.purdue.edu/anvilops/${config.builder}-builder:latest`,
                env: [
                  { name: "CLONE_URL", value: gitRepoURL },
                  { name: "REF", value: ref },
                  { name: "IMAGE_TAG", value: imageTag },
                  { name: "CACHE_TAG", value: imageCacheTag },
                  { name: "DEPLOYMENT_API_SECRET", value: deploymentSecret },
                  {
                    name: "DEPLOYMENT_API_URL",
                    value: "https://anvilops.rcac.purdue.edu/api",
                  },
                  { name: "DOCKER_CONFIG", value: "/creds" },
                  { name: "ROOT_DIRECTORY", value: config.rootDir },
                  // Dockerfile builder only
                  ...(config.builder === "dockerfile"
                    ? [
                        {
                          name: "DOCKERFILE_PATH",
                          value: config.dockerfilePath,
                        },
                      ]
                    : []),
                ],
                imagePullPolicy: "Always",
                lifecycle: {
                  preStop: {
                    exec: {
                      command: ["/bin/sh", "-c", "/var/run/pre-stop.sh"],
                    },
                  },
                },
                volumeMounts: [
                  {
                    mountPath: "/certs",
                    name: "buildkitd-tls-certs",
                    readOnly: true,
                  },
                  {
                    mountPath: "/creds",
                    name: "registry-credentials",
                    readOnly: true,
                  },
                ],
              },
            ],
            volumes: [
              {
                name: "buildkitd-tls-certs",
                secret: { secretName: "buildkit-client-certs" },
              },
              {
                name: "registry-credentials",
                secret: {
                  secretName: "registry-credentials",
                  defaultMode: 511,
                },
              },
            ],
            restartPolicy: "Never",
          },
        },
      },
    },
  });

  return job.metadata.uid;
}
