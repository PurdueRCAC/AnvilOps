import { k8s_batch } from "./kubernetes.ts";

type Builder = "railpack" | "dockerfile";

type ImageTag = `${string}/${string}/${string}:${string}`;

export async function createBuildJob(
  builder: Builder,
  gitRepoURL: string,
  imageTag: ImageTag,
  imageCacheTag: ImageTag
) {
  switch (builder) {
    case "dockerfile": {
    }
    case "railpack": {
      break;
    }
    default: {
      throw new Error("Unknown builder: " + builder);
    }
  }

  const job = await k8s_batch.createNamespacedJob({
    namespace: "anvilops-dev",
    body: {
      spec: {
        ttlSecondsAfterFinished: 300, // Delete jobs 5 minutes after they complete
        template: {
          spec: {
            containers: [
              {
                name: "builder",
                image: `registry.anvil.rcac.purdue.edu/anvilops/${builder}-builder:latest`,
                env: [
                  { name: "CLONE_URL", value: gitRepoURL },
                  { name: "IMAGE_TAG", value: imageTag },
                  { name: "CACHE_TAG", value: imageCacheTag },
                ],
                volumeMounts: [
                  {
                    mountPath: "/certs",
                    name: "buildkitd-tls-certs",
                    readOnly: true,
                  },
                ],
              },
            ],
            volumes: [
              {
                name: "buildkitd-tls-certs",
                secret: { secretName: "buildkit-daemon-certs" },
              },
            ],
          },
        },
      },
    },
  });

  return job.metadata.uid;
}
