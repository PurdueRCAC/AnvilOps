import { randomBytes } from "node:crypto";
import { k8s } from "./kubernetes.ts";
import { db } from "./db.ts";
import type { DeploymentConfig } from "../generated/prisma/client.ts";

export type ImageTag = `${string}/${string}/${string}:${string}`;

const MAX_JOBS = 6;

async function createJob({
  tag,
  gitRepoURL,
  imageTag,
  imageCacheTag,
  deploymentSecret,
  ref,
  appId,
  deploymentId,
  config,
}: {
  tag: string;
  gitRepoURL: string;
  imageTag: ImageTag;
  imageCacheTag: ImageTag;
  deploymentSecret: string;
  ref: string;
  appId: number;
  deploymentId: number;
  config: Pick<DeploymentConfig, "builder" | "dockerfilePath" | "rootDir">;
}) {
  const label = randomBytes(4).toString("hex");
  return k8s.batch.createNamespacedJob({
    namespace: "anvilops-dev",
    body: {
      metadata: {
        name: `build-image-${tag}-${label}`,
        labels: {
          "anvilops.rcac.purdue.edu/app-id": appId.toString(),
          "anvilops.rcac.purdue.edu/deployment-id": deploymentId.toString(),
        },
      },
      spec: {
        ttlSecondsAfterFinished: 5 * 60, // Delete jobs 5 minutes after they complete
        backoffLimit: 1, // Retry builds up to 1 time if they exit with a non-zero status code
        activeDeadlineSeconds: 30 * 60, // Kill builds after 30 minutes
        template: {
          metadata: {
            labels: {
              "anvilops.rcac.purdue.edu/app-id": appId.toString(),
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
                  {
                    name: "BUILDKITD_ADDRESS",
                    value: "tcp://buildkitd:1234",
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
}

export async function createBuildJob(data: {
  tag: string;
  gitRepoURL: string;
  imageTag: ImageTag;
  imageCacheTag: ImageTag;
  deploymentSecret: string;
  ref: string;
  appId: number;
  deploymentId: number;
  config: Pick<DeploymentConfig, "builder" | "dockerfilePath" | "rootDir">;
}) {
  if (!["dockerfile", "railpack"].includes(data.config.builder)) {
    throw new Error(
      "Invalid builder: " +
        data.config.builder +
        ". Expected dockerfile or railpack.",
    );
  }

  await db.deployment.updateMany({
    where: {
      id: {
        not: data.deploymentId,
      },
      appId: data.appId,
      status: {
        notIn: ["COMPLETE", "ERROR"],
      },
    },
    data: { status: "STOPPED" },
  });

  await cancelBuildJobsForApp(data.appId);

  // Store it in db - we'll pop it out when another job finishes.
  if ((await countActiveBuildJobs()) >= MAX_JOBS) {
    await queueBuildJob(data);
    return undefined;
  }

  console.log(
    `Starting build job for deployment ${data.deploymentId} of app ${data.appId}`,
  );
  const job = await createJob(data);

  return job.metadata.uid;
}

async function cancelBuildJobsForApp(appId: number) {
  await k8s.batch.deleteCollectionNamespacedJob({
    namespace: "anvilops-dev",
    labelSelector: `anvilops.rcac.purdue.edu/app-id=${appId.toString()}`,
  });
}

async function countActiveBuildJobs() {
  const jobs = await k8s.batch.listNamespacedJob({
    namespace: "anvilops-dev",
  });

  return jobs.items.filter((job) => job.status?.active).length;
}

async function queueBuildJob({
  tag,
  ref,
  gitRepoURL,
  imageTag,
  imageCacheTag,
  deploymentSecret,
  deploymentId,
  appId,
}: {
  tag: string;
  ref: string;
  gitRepoURL: string;
  imageTag: string;
  imageCacheTag: string;
  deploymentSecret: string;
  deploymentId: number;
  appId: number;
}) {
  // Ensure one deployment queued for each app

  await db.queuedJob.deleteMany({
    where: { deployment: { appId } },
  });

  await db.deployment.updateMany({
    where: {
      id: {
        not: deploymentId,
      },
      appId,
      status: {
        notIn: ["COMPLETE", "ERROR"],
      },
    },
    data: { status: "STOPPED" },
  });

  await db.deployment.update({
    where: { id: deploymentId },
    data: { status: "QUEUED" },
  });

  await db.queuedJob.create({
    data: {
      tag,
      ref,
      gitRepoURL,
      imageTag,
      imageCacheTag,
      deploymentSecret,
      deployment: {
        connect: {
          id: deploymentId,
        },
      },
    },
  });
}

export async function dequeueBuildJob() {
  if ((await countActiveBuildJobs()) >= MAX_JOBS) {
    return;
  }

  // Remove the job at the front of the queue, locking the row
  // so it cannot be dequeued twice
  const [result] = await db.$queryRaw<
    {
      tag: string;
      ref: string;
      gitRepoURL: string;
      imageTag: `${string}/${string}/${string}:${string}`;
      imageCacheTag: `${string}/${string}/${string}:${string}`;
      deploymentSecret: string;
      deploymentId: number;
      id: number;
    }[]
  >`
    WITH next as (
    SELECT id FROM "QueuedJob"
    ORDER BY id
    FOR UPDATE SKIP LOCKED
    LIMIT 1
    )
    DELETE FROM "QueuedJob" as job
    USING next
    WHERE job.id = next.id
    RETURNING job.*
  `;

  if (result) {
    const deployment = await db.deployment.findUnique({
      where: { id: result.deploymentId },
      include: {
        config: true,
      },
    });
    console.log(
      `Starting build job for deployment ${deployment.id} of app ${deployment.appId}`,
    );
    const job = await createJob({
      ...result,
      appId: deployment.appId,
      config: deployment.config,
    });
    await db.deployment.update({
      where: { id: deployment.id },
      data: { builderJobId: job.metadata.uid },
    });
  } else {
    console.log("Build job queue is empty.");
  }
}
