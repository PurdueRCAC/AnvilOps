import {
  PatchStrategy,
  setHeaderOptions,
  type V1Pod,
} from "@kubernetes/client-node";
import { createHash, randomBytes } from "node:crypto";
import type {
  App,
  Deployment,
  GitConfig,
  Organization,
} from "../../db/models.ts";
import type { AppRepo } from "../../db/repo/app.ts";
import type { DeploymentRepo } from "../../db/repo/deployment.ts";
import type { OrganizationRepo } from "../../db/repo/organization.ts";
import { env } from "../../lib/env.ts";
import { logger } from "../../logger.ts";
import { type KubernetesClientService } from "./cluster/kubernetes.ts";
import type { LogCollectionService } from "./cluster/resources/logs.ts";
import type { DeploymentConfigService } from "./deploymentConfig.ts";
import type { GitProviderFactoryService } from "./git/gitProvider.ts";

const MAX_JOBS = 6;

export class BuilderService {
  private orgRepo: OrganizationRepo;
  private appRepo: AppRepo;
  private deploymentRepo: DeploymentRepo;
  private gitProviderFactoryService: GitProviderFactoryService;
  private logCollectionService: LogCollectionService;
  private deploymentConfigService: DeploymentConfigService;
  private kubernetesService: KubernetesClientService;

  constructor(
    orgRepo: OrganizationRepo,
    appRepo: AppRepo,
    deploymentRepo: DeploymentRepo,
    gitProviderFactoryService: GitProviderFactoryService,
    logCollectionService: LogCollectionService,
    deploymentConfigService: DeploymentConfigService,
    kubernetesService: KubernetesClientService,
  ) {
    this.orgRepo = orgRepo;
    this.appRepo = appRepo;
    this.deploymentRepo = deploymentRepo;
    this.gitProviderFactoryService = gitProviderFactoryService;
    this.logCollectionService = logCollectionService;
    this.deploymentConfigService = deploymentConfigService;
    this.kubernetesService = kubernetesService;
  }

  async createJobFromDeployment(
    org: Organization,
    app: App,
    deployment: Deployment,
    config: GitConfig,
  ) {
    const gitProvider = await this.gitProviderFactoryService.getGitProvider(
      org.id,
    );
    const cloneURL = await gitProvider.generateCloneURL(config.repositoryId);

    const label = randomBytes(4).toString("hex");
    const secretName = `anvilops-temp-build-secrets-${app.id}-${deployment.id}`;
    const jobName = `build-image-${app.imageRepo}-${label}`;

    const envVars = config.getEnv();

    const extraEnv =
      await this.deploymentConfigService.generateAutomaticEnvVars(
        gitProvider,
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
      await this.kubernetesService.createNamespacedSecret({
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
                    {
                      name: "RAILPACK_INTERNAL_FRONTEND_IMAGE",
                      value: env.RAILPACK_INTERNAL_FRONTEND_IMAGE,
                    },
                    {
                      name: "RAILPACK_INTERNAL_BUILDER_IMAGE",
                      value: env.RAILPACK_INTERNAL_BUILDER_IMAGE,
                    },
                    {
                      name: "RAILPACK_INTERNAL_RUNTIME_IMAGE",
                      value: env.RAILPACK_INTERNAL_RUNTIME_IMAGE,
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

    const job = await this.kubernetesService.createNamespacedJob({
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
          template: await this.logCollectionService.wrapWithLogExporter(
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
        await this.kubernetesService.patchNamespacedSecret(
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
        logger.error(
          e,
          "Failed to update secret to be owned by its builder job",
        );
        try {
          // The secret won't get cleaned up automatically when the build job does.
          // Remove it manually now and throw an error.
          await this.kubernetesService.deleteNamespacedSecret({
            name: secretName,
            namespace: env.CURRENT_NAMESPACE,
          });
        } catch (err) {
          logger.error(
            err,
            "Failed to delete secret while handling error updating the secret to be owned by its build job",
          );
        }
        throw e;
      }
    }

    return job;
  }

  async createBuildJob(
    ...params: Parameters<typeof this.createJobFromDeployment>
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
    if ((await this.kubernetesService.countActiveBuildJobs()) >= MAX_JOBS) {
      logger.info(
        { deploymentId: deployment.id, appId: deployment.appId },
        "Adding build job to queue",
      );
      await this.deploymentRepo.setStatus(deployment.id, "QUEUED");
      return null;
    }

    logger.info(
      { deploymentId: deployment.id, appId: deployment.appId },
      "Starting build job",
    );
    const job = await this.createJobFromDeployment(...params);

    return job.metadata.uid;
  }

  /**
   * @returns The UID of the created build job, or null if the queue is full
   * @throws {Error} if the config is not a GitConfig
   */
  async dequeueBuildJob(): Promise<string> {
    if ((await this.kubernetesService.countActiveBuildJobs()) >= MAX_JOBS) {
      return null;
    }

    // Remove the job at the front of the queue, locking the row
    // so it cannot be dequeued twice
    const deployment = await this.deploymentRepo.getNextInQueue();

    if (!deployment) {
      return null;
    }

    const app = await this.appRepo.getById(deployment.appId);
    const org = await this.orgRepo.getById(app.orgId);
    const config = (
      await this.deploymentRepo.getConfig(deployment.id)
    ).asGitConfig();

    logger.info(
      { deploymentId: deployment.id, appId: deployment.appId },
      "Starting build job from queue",
    );
    const job = await this.createJobFromDeployment(
      org,
      app,
      deployment,
      config,
    );
    return job.metadata.uid;
  }
}
