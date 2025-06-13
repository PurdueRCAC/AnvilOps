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
  config,
}: {
  tag: string;
  gitRepoURL: string;
  imageTag: ImageTag;
  imageCacheTag: ImageTag;
  deploymentSecret: string;
  ref: string;
  config: DeploymentConfigCreateWithoutDeploymentInput;
}) {
  if (!["dockerfile", "railpack"].includes(config.builder)) {
    throw new Error(
      "Invalid builder: " +
        config.builder +
        ". Expected dockerfile or railpack.",
    );
  }

  const job = await k8s.batch.createNamespacedJob({
    namespace: "anvilops-dev",
    body: {
      metadata: {
        name: `build-image-${tag}`,
      },
      spec: {
        ttlSecondsAfterFinished: 300, // Delete jobs 5 minutes after they complete
        backoffLimit: 1,
        template: {
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
