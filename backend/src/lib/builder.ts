import { randomBytes } from "node:crypto";
import type {
  App,
  Deployment,
  DeploymentConfig,
  Organization,
} from "../generated/prisma/client.ts";
import { generateCloneURLWithCredentials } from "../handlers/githubWebhook.ts";
import { k8s } from "./cluster/kubernetes.ts";
import { db } from "./db.ts";
import { getOctokit, getRepoById } from "./octokit.ts";

export type ImageTag = `${string}/${string}/${string}:${string}`;

const MAX_JOBS = 6;

export type CreateJobFromDeploymentInput = Parameters<
  typeof createJobFromDeployment
>[0];

async function createJobFromDeployment(
  deployment: Pick<Deployment, "id" | "commitHash" | "appId" | "secret"> & {
    config: Pick<
      DeploymentConfig,
      "builder" | "dockerfilePath" | "imageTag" | "repositoryId" | "rootDir"
    >;
    app: Pick<App, "imageRepo"> & {
      org: Pick<Organization, "githubInstallationId">;
    };
  },
) {
  const octokit = await getOctokit(deployment.app.org.githubInstallationId);
  const repo = await getRepoById(octokit, deployment.config.repositoryId);

  return await createJob({
    tag: deployment.app.imageRepo,
    ref: deployment.commitHash,
    gitRepoURL: await generateCloneURLWithCredentials(octokit, repo.html_url),
    imageTag: deployment.config.imageTag as ImageTag,
    imageCacheTag: `registry.anvil.rcac.purdue.edu/anvilops/${deployment.app.imageRepo}:build-cache`,
    deploymentSecret: deployment.secret,
    appId: deployment.appId,
    deploymentId: deployment.id,
    config: deployment.config,
  });
}

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

export async function createBuildJob(deployment: CreateJobFromDeploymentInput) {
  if (!["dockerfile", "railpack"].includes(deployment.config.builder)) {
    throw new Error(
      "Invalid builder: " +
        deployment.config.builder +
        ". Expected dockerfile or railpack.",
    );
  }

  // Mark this deployment as "queued" - we'll run it when another job finishes.
  if ((await countActiveBuildJobs()) >= MAX_JOBS) {
    await db.deployment.update({
      where: { id: deployment.id },
      data: { status: "QUEUED" },
    });
    return await dequeueBuildJob();
  }

  console.log(
    `Starting build job for deployment ${deployment.id} of app ${deployment.appId}`,
  );
  const job = await createJobFromDeployment(deployment);

  return job.metadata.uid;
}

export async function cancelBuildJobsForApp(appId: number) {
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

/** @returns The UID of the created build job, or null if the queue is full */
export async function dequeueBuildJob(): Promise<string> {
  if ((await countActiveBuildJobs()) >= MAX_JOBS) {
    return null;
  }

  // Remove the job at the front of the queue, locking the row
  // so it cannot be dequeued twice
  const [result] = await db.$queryRaw<{ id: number }[]>`
    WITH next as (
      SELECT id FROM "Deployment"
        WHERE status = 'QUEUED'
        ORDER BY "createdAt"
        FOR UPDATE SKIP LOCKED
        LIMIT 1
    )
    UPDATE "Deployment" SET status = 'PENDING'
      WHERE id IN (SELECT id FROM next)
      RETURNING id
  `;

  if (result) {
    const deployment = await db.deployment.findUnique({
      where: { id: result.id },
      select: {
        id: true,
        appId: true,
        secret: true,
        config: true,
        commitHash: true,
        app: {
          select: {
            imageRepo: true,
            org: { select: { githubInstallationId: true } },
          },
        },
      },
    });
    console.log(
      `Starting build job for deployment ${deployment.id} of app ${deployment.appId}`,
    );
    const job = await createJobFromDeployment(deployment);
    await db.deployment.update({
      where: { id: deployment.id },
      data: { builderJobId: job.metadata.uid },
    });
    return job.metadata.uid;
  } else {
    console.log("Build job queue is empty.");
  }
}
