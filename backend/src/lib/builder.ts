import {
  PatchStrategy,
  setHeaderOptions,
  type V1Pod,
} from "@kubernetes/client-node";
import { createHash, randomBytes } from "node:crypto";
import { db } from "../db/index.ts";
import type { App, Deployment, GitConfig, Organization } from "../db/models.ts";
import { generateCloneURLWithCredentials } from "../handlers/githubWebhook.ts";
import { svcK8s } from "./cluster/kubernetes.ts";
import { wrapWithLogExporter } from "./cluster/resources/logs.ts";
import { generateAutomaticEnvVars } from "./cluster/resources/statefulset.ts";
import { env } from "./env.ts";
import { getOctokit, getRepoById } from "./octokit.ts";

export type ImageTag = `${string}/${string}/${string}:${string}`;

const MAX_JOBS = 6;

async function createJobFromDeployment(
  org: Organization,
  app: App,
  deployment: Deployment,
  config: GitConfig,
) {
  const octokit = await getOctokit(org.githubInstallationId);
  const repo = await getRepoById(octokit, config.repositoryId);
  const cloneURL = await generateCloneURLWithCredentials(
    octokit,
    repo.html_url,
  );

  const label = randomBytes(4).toString("hex");
  const secretName = `anvilops-temp-build-secrets-${app.id}-${deployment.id}`;
  const jobName = `build-image-${app.imageRepo}-${label}`;

  const envVars = config.getEnv();

  const extraEnv = await generateAutomaticEnvVars(
    octokit,
    deployment,
    config,
    app,
  );
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

  const podTemplate: V1Pod = {
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
            { name: "IMAGE_TAG", value: config.imageTag },
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
            {
              mountPath: "/home/appuser",
              name: "temp",
              subPath: "home",
            },
            ...(config.builder === "railpack"
              ? [
                  // Railpack needs an additional directory to be writable
                  {
                    mountPath: "/tmp/railpack/mise",
                    name: "temp",
                    subPath: "mise",
                  },
                ]
              : []),
          ],
          resources: {
            limits: {
              cpu: "500m",
              memory: "500Mi",
            },
            requests: {
              cpu: "250m",
              memory: "128Mi",
            },
          },
          securityContext: {
            capabilities: {
              drop: ["ALL"],
            },
            runAsNonRoot: true,
            runAsUser: 65532,
            runAsGroup: 65532,
            readOnlyRootFilesystem: true,
            allowPrivilegeEscalation: false,
          },
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
        {
          name: "temp",
          emptyDir: {
            sizeLimit: "1Gi",
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

export async function createBuildJob(
  ...params: Parameters<typeof createJobFromDeployment>
) {
  const deployment = params[2] satisfies Deployment;
  const config = params[3] satisfies GitConfig;

  if (!["dockerfile", "railpack"].includes(config.builder)) {
    throw new Error(
      "Invalid builder: " +
        config.builder +
        ". Expected dockerfile or railpack.",
    );
  }

  // Mark this deployment as "queued" - we'll run it when another job finishes.
  if ((await countActiveBuildJobs()) >= MAX_JOBS) {
    await db.deployment.setStatus(deployment.id, "QUEUED");
    return null;
  }

  console.log(
    `Starting build job for deployment ${deployment.id} of app ${deployment.appId}`,
  );
  const job = await createJobFromDeployment(...params);

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
    // TODO filter for a certain label that indicates that this Job is a build job
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
  const deployment = await db.deployment.getNextInQueue();

  if (!deployment) {
    return null;
  }

  const app = await db.app.getById(deployment.appId);
  const org = await db.org.getById(app.orgId);
  const config = (await db.deployment.getConfig(deployment.id)) as GitConfig;

  console.log(
    `Starting build job for deployment ${deployment.id} of app ${deployment.appId}`,
  );
  const job = await createJobFromDeployment(org, app, deployment, config);
  return job.metadata.uid;
}
