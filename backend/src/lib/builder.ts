import { k8s } from "./kubernetes.ts";

type Builder = "railpack" | "dockerfile";

type ImageTag = `${string}/${string}/${string}:${string}`;

export async function createBuildJob(
  tag: string,
  builder: Builder,
  gitRepoURL: string,
  imageTag: ImageTag,
  imageCacheTag: ImageTag,
  deploymentSecret: string,
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

  const job = await k8s.batch.createNamespacedJob({
    namespace: "anvilops-dev",
    body: {
      metadata: {
        name: `build-app-image-${tag}`,
      },
      spec: {
        ttlSecondsAfterFinished: 300, // Delete jobs 5 minutes after they complete
        backoffLimit: 5,
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
                  { name: "DEPLOYMENT_API_SECRET", value: deploymentSecret },
                  {
                    name: "DEPLOYMENT_API_URL",
                    value: "https://anvilops.rcac.purdue.edu/api",
                  },
                  { name: "DOCKER_CONFIG", value: "/root/.docker" },
                ],
                imagePullPolicy: "Always",
                volumeMounts: [
                  {
                    mountPath: "/certs",
                    name: "buildkitd-tls-certs",
                    readOnly: true,
                  },
                  {
                    mountPath: "/root/.docker",
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
                secret: { secretName: "registry-credentials" },
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
