import { PatchStrategy, setHeaderOptions } from "@kubernetes/client-node";
import { createHash, randomBytes } from "node:crypto";
import type {
  App,
  Deployment,
  Organization,
} from "../generated/prisma/client.ts";
import { generateCloneURLWithCredentials } from "../handlers/githubWebhook.ts";
import { svcK8s } from "./cluster/kubernetes.ts";
import { wrapWithLogExporter } from "./cluster/resources/logs.ts";
import { generateAutomaticEnvVars } from "./cluster/resources/statefulset.ts";
import { db } from "./db.ts";
import { env } from "./env.ts";
import { getOctokit, getRepoById } from "./octokit.ts";

export type ImageTag = `${string}/${string}/${string}:${string}`;

const MAX_JOBS = 6;

export type CreateJobFromDeploymentInput = Parameters<
  typeof createJobFromDeployment
>[0];

async function createJobFromDeployment(
  deployment: Pick<Deployment, "id" | "commitMessage" | "appId" | "secret"> & {
    config: ExtendedDeploymentConfig;
    app: Pick<
      App,
      "id" | "displayName" | "namespace" | "imageRepo" | "logIngestSecret"
    > & {
      org: Pick<Organization, "githubInstallationId">;
    };
  },
) {
  const { app, config } = deployment;
  const octokit = await getOctokit(app.org.githubInstallationId);
  const repo = await getRepoById(octokit, deployment.config.repositoryId);
  const cloneURL = await generateCloneURLWithCredentials(
    octokit,
    repo.html_url,
  );

  const label = randomBytes(4).toString("hex");
  const secretName = `anvilops-temp-build-secrets-${app.id}-${deployment.id}`;
  const jobName = `build-image-${app.imageRepo}-${label}`;

  const envVars = deployment.config.getPlaintextEnv();

  const extraEnv = await generateAutomaticEnvVars(octokit, deployment);
  extraEnv.push({ name: "CI", value: "1" });
  for (const envVar of extraEnv) {
    if (!envVars.some((it) => it.name === envVar.name)) {
      envVars.push({ ...envVar, isSensitive: false });
    }
  }

  if (envVars.length > 0) {
    const map: Record<string, string> = {};
    for (const { name, value } of envVars) {
      map[name] = value;
    }
    await svcK8s["CoreV1Api"].createNamespacedSecret({
      namespace: env.CURRENT_NAMESPACE,
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

  const podTemplate = {
    metadata: {
      labels: {
        "anvilops.rcac.purdue.edu/app-id": app.id.toString(),
        "anvilops.rcac.purdue.edu/deployment-id": deployment.id.toString(),
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
            { name: "CLONE_URL", value: cloneURL },
            { name: "REF", value: config.commitHash },
            {
              name: "IMAGE_TAG",
              value: deployment.config.imageTag as ImageTag,
            },
            {
              name: "CACHE_TAG",
              value: `${env.REGISTRY_HOSTNAME}/${env.HARBOR_PROJECT_NAME}/${app.imageRepo}:build-cache`,
            },
            { name: "DEPLOYMENT_API_SECRET", value: deployment.secret },
            {
              name: "DEPLOYMENT_API_URL",
              value: `${env.CLUSTER_INTERNAL_BASE_URL}/api`,
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
            items: [{ key: ".dockerconfigjson", path: "config.json" }],
          },
        },
      ],
      restartPolicy: "Never",
    },
  };

  const job = await svcK8s["BatchV1Api"].createNamespacedJob({
    namespace: env.CURRENT_NAMESPACE,
    body: {
      metadata: {
        name: jobName,
        labels: {
          "anvilops.rcac.purdue.edu/app-id": app.id.toString(),
          "anvilops.rcac.purdue.edu/deployment-id": deployment.id.toString(),
        },
      },
      spec: {
        ttlSecondsAfterFinished: 5 * 60, // Delete jobs 5 minutes after they complete
        backoffLimit: 1, // Retry builds up to 1 time if they exit with a non-zero status code
        activeDeadlineSeconds: 30 * 60, // Kill builds after 30 minutes
        template: await wrapWithLogExporter(
          "build",
          app.logIngestSecret,
          deployment.id,
          podTemplate,
        ),
      },
    },
  });

  if (envVars.length > 0) {
    try {
      await svcK8s["CoreV1Api"].patchNamespacedSecret(
        {
          name: secretName,
          namespace: env.CURRENT_NAMESPACE,
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
        await svcK8s["CoreV1Api"].deleteNamespacedSecret({
          name: secretName,
          namespace: env.CURRENT_NAMESPACE,
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
  await svcK8s["BatchV1Api"].deleteCollectionNamespacedJob({
    namespace: env.CURRENT_NAMESPACE,
    labelSelector: `anvilops.rcac.purdue.edu/app-id=${appId.toString()}`,
    propagationPolicy: "Background", // Delete dependent resources (pods and secrets) in the background. Without this option, they would not be deleted at all.
  });
}

async function countActiveBuildJobs() {
  const jobs = await svcK8s["BatchV1Api"].listNamespacedJob({
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
        commitMessage: true,
        // commitHash: true,
        app: {
          select: {
            id: true,
            displayName: true,
            imageRepo: true,
            logIngestSecret: true,
            namespace: true,
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
