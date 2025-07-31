import { PatchStrategy, setHeaderOptions } from "@kubernetes/client-node";
import { createHash, randomBytes } from "node:crypto";
import type {
  App,
  Deployment,
  Organization,
} from "../generated/prisma/client.ts";
import { DeploymentConfigScalarFieldEnum } from "../generated/prisma/internal/prismaNamespace.ts";
import { generateCloneURLWithCredentials } from "../handlers/githubWebhook.ts";
import { k8s } from "./cluster/kubernetes.ts";
import { db } from "./db.ts";
import { env } from "./env.ts";
import { getOctokit, getRepoById } from "./octokit.ts";

export type ImageTag = `${string}/${string}/${string}:${string}`;

const MAX_JOBS = 6;

export type CreateJobFromDeploymentInput = Parameters<
  typeof createJobFromDeployment
>[0];

async function createJobFromDeployment(
  deployment: Pick<Deployment, "id" | "commitHash" | "appId" | "secret"> & {
    config: Pick<
      ExtendedDeploymentConfig,
      | "builder"
      | "dockerfilePath"
      | "imageTag"
      | "repositoryId"
      | "rootDir"
      | "env"
      | "envKey"
      | "getPlaintextEnv"
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
    imageCacheTag: `${env.REGISTRY_HOSTNAME}/${env.HARBOR_PROJECT_NAME}/${deployment.app.imageRepo}:build-cache`,
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
  config: Pick<
    ExtendedDeploymentConfig,
    | "builder"
    | "dockerfilePath"
    | "rootDir"
    | "env"
    | "envKey"
    | "getPlaintextEnv"
  >;
}) {
  DeploymentConfigScalarFieldEnum;
  const label = randomBytes(4).toString("hex");
  const secretName = `anvilops-temp-build-secrets-${appId}-${deploymentId}`;
  const jobName = `build-image-${tag}-${label}`;

  const envVars = config.getPlaintextEnv();

  if (envVars.length > 0) {
    const map: Record<string, string> = {};
    for (const { name, value } of envVars) {
      map[name] = value;
    }
    await k8s.default.createNamespacedSecret({
      namespace: "anvilops-dev",
      body: {
        apiVersion: "v1",
        kind: "Secret",
        metadata: { name: secretName },
        stringData: map,
      },
    });
  }

  const secretHash = createHash("sha256")
    .update(JSON.stringify(envVars))
    .digest("hex");

  const job = await k8s.batch.createNamespacedJob({
    namespace: env.CURRENT_NAMESPACE,
    body: {
      metadata: {
        name: jobName,
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
            automountServiceAccountToken: false,
            containers: [
              {
                name: "builder",
                image:
                  config.builder === "dockerfile"
                    ? env.DOCKERFILE_BUILDER_IMAGE
                    : env.RAILPACK_BUILDER_IMAGE,
                env: [
                  { name: "CLONE_URL", value: gitRepoURL },
                  { name: "REF", value: ref },
                  { name: "IMAGE_TAG", value: imageTag },
                  { name: "CACHE_TAG", value: imageCacheTag },
                  { name: "DEPLOYMENT_API_SECRET", value: deploymentSecret },
                  {
                    name: "DEPLOYMENT_API_URL",
                    value: `${env.BASE_URL}/api`,
                  },
                  {
                    name: "BUILDKITD_ADDRESS",
                    value: env.BUILDKITD_ADDRESS,
                  },
                  { name: "DOCKER_CONFIG", value: "/creds" },
                  { name: "ROOT_DIRECTORY", value: config.rootDir },
                  { name: "SECRET_CHECKSUM", value: secretHash },
                  {
                    name: "BUILDKIT_SECRET_DEFS",
                    value: envVars
                      .map(
                        (envVar, i) =>
                          `--secret id=${envVar.name.replaceAll('"', '\\"')},env=ANVILOPS_SECRET_${i}`,
                      )
                      .join(" "),
                  },
                  ...envVars.map((envVar, i) => ({
                    name: `ANVILOPS_SECRET_${i}`,
                    valueFrom: {
                      secretKeyRef: {
                        name: secretName,
                        key: envVar.name,
                      },
                    },
                  })),
                  // Railpack builder only
                  ...(config.builder === "railpack"
                    ? [
                        {
                          name: "RAILPACK_ENV_ARGS",
                          value: envVars
                            .map(
                              (envVar) =>
                                `--env ${envVar.name.replaceAll('"', '\\"')}=null`, // The value doesn't matter here - Railpack expects it, but only the name is used to create a secret reference.
                            )
                            .join(" "),
                        },
                      ]
                    : []),
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
                  secretName: "image-push-secret",
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

  if (envVars.length > 0) {
    try {
      await k8s.default.patchNamespacedSecret(
        {
          name: secretName,
          namespace: "anvilops-dev",
          body: {
            metadata: {
              ownerReferences: [
                {
                  apiVersion: "batch/v1",
                  kind: "Job",
                  name: jobName,
                  uid: job?.metadata?.uid,
                  controller: true, // Delete this secret automatically when the job is deleted
                },
              ],
            },
          },
        },
        setHeaderOptions("Content-Type", PatchStrategy.MergePatch),
      );
    } catch (e) {
      try {
        // The secret won't get cleaned up automatically when the build job does.
        // Remove it manually now and throw an error.
        await k8s.default.deleteNamespacedSecret({
          name: secretName,
          namespace: "anvilops-dev",
        });
      } catch {}
      throw e;
    }
  }

  return job;
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
    return null;
  }

  console.log(
    `Starting build job for deployment ${deployment.id} of app ${deployment.appId}`,
  );
  const job = await createJobFromDeployment(deployment);

  return job.metadata.uid;
}

export async function cancelBuildJobsForApp(appId: number) {
  await k8s.batch.deleteCollectionNamespacedJob({
    namespace: env.CURRENT_NAMESPACE,
    labelSelector: `anvilops.rcac.purdue.edu/app-id=${appId.toString()}`,
  });
}

async function countActiveBuildJobs() {
  const jobs = await k8s.batch.listNamespacedJob({
    namespace: env.CURRENT_NAMESPACE,
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
