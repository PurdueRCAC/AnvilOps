import { randomBytes } from "node:crypto";
import type {
  AppType,
  DeploymentStatus,
  LogType,
  PermissionLevel,
} from "../../generated/prisma/enums.ts";
import type {
  HelmConfigModel as PrismaHelmConfig,
  WorkloadConfigModel as PrismaWorkloadConfig,
  WorkloadConfigCreateInput,
} from "../../generated/prisma/models.ts";
import { decryptEnv, encryptEnv, generateKey } from "../crypto.ts";
import type { PrismaClientType } from "../index.ts";
import type {
  Deployment,
  DeploymentConfig,
  DeploymentWithSourceInfo,
  GitConfig,
  HelmConfig,
  HelmConfigCreate,
  Log,
  WorkloadConfig,
  WorkloadConfigCreate,
} from "../models.ts";

type PrismaWorkloadConfigCreate = Omit<WorkloadConfigCreate, "appType">;
type PrismaHelmConfigCreate = Omit<HelmConfigCreate, "appType" | "source">;
export class DeploymentRepo {
  private client: PrismaClientType;
  private publish: (topic: string, payload: any) => Promise<void>;

  constructor(
    client: PrismaClientType,
    publish: (topic: string, payload: any) => Promise<void>,
  ) {
    this.client = client;
    this.publish = publish;
  }

  async getById(
    deploymentId: number,
    options?: {
      requireUser?: { id: number; permissionLevel?: PermissionLevel };
    },
  ): Promise<Deployment> {
    const deployment = await this.client.deployment.findUnique({
      where: {
        id: deploymentId,
        ...(options?.requireUser
          ? {
              app: {
                org: {
                  users: {
                    some: {
                      userId: options.requireUser.id,
                      permissionLevel: options.requireUser.permissionLevel,
                    },
                  },
                },
              },
            }
          : {}),
      },
      select: {
        id: true,
        workflowRunId: true,
        secret: true, // We need to specify all the properties to select because we've chosen to exclude `secret` by default in our Prisma Client options
        configId: true,
        appId: true,
        createdAt: true,
        updatedAt: true,
        commitMessage: true,
        status: true,
        checkRunId: true,
      },
    });

    return deployment;
  }

  async create({
    appId,
    config,
    commitMessage,
    workflowRunId,
    status,
  }: {
    appId: number;
    config: WorkloadConfigCreate | HelmConfigCreate;
    commitMessage: string | null;
    workflowRunId?: number;
    status?: DeploymentStatus;
  }): Promise<Deployment> {
    const configClone = structuredClone(config);
    const appType = configClone.appType;
    if (appType === "workload") {
      delete configClone.appType;
    } else if (appType === "helm") {
      delete configClone.appType;
      delete configClone.source;
    }
    return await this.client.deployment.create({
      data: {
        app: { connect: { id: appId } },
        config: {
          create: {
            appType: appType,
            ...(appType === "workload"
              ? {
                  workloadConfig: {
                    create: DeploymentRepo.encryptEnv(configClone),
                  },
                }
              : {
                  helmConfig: {
                    create: configClone,
                  },
                }),
          },
        },
        commitMessage,
        workflowRunId,
        secret: randomBytes(32).toString("hex"),
        status,
      },
      select: {
        id: true,
        workflowRunId: true,
        secret: true, // We need to specify all the properties to select because we've chosen to exclude `secret` by default in our Prisma Client options
        configId: true,
        appId: true,
        createdAt: true,
        updatedAt: true,
        commitMessage: true,
        status: true,
        checkRunId: true,
      },
    });
  }

  async getFromSecret(secret: string): Promise<Deployment | null> {
    return this.client.deployment.findUnique({
      where: { secret: secret },
      select: {
        id: true,
        workflowRunId: true,
        secret: true, // We need to specify all the properties to select because we've chosen to exclude `secret` by default in our Prisma Client options
        configId: true,
        appId: true,
        createdAt: true,
        updatedAt: true,
        commitMessage: true,
        status: true,
        checkRunId: true,
      },
    });
  }

  async getFromWorkflowRunId(
    appId: number,
    workflowRunId: number,
  ): Promise<Deployment | null> {
    return this.client.deployment.findUnique({
      where: { appId, workflowRunId },
      select: {
        id: true,
        workflowRunId: true,
        secret: true, // We need to specify all the properties to select because we've chosen to exclude `secret` by default in our Prisma Client options
        configId: true,
        appId: true,
        createdAt: true,
        updatedAt: true,
        commitMessage: true,
        status: true,
        checkRunId: true,
      },
    });
  }

  async getConfig(deploymentId: number): Promise<DeploymentConfig> {
    const deployment = await this.client.deployment.findUnique({
      where: { id: deploymentId },
      select: {
        config: {
          include: {
            workloadConfig: { omit: { id: true, deploymentConfigId: true } },
            helmConfig: { omit: { id: true, deploymentConfigId: true } },
          },
        },
      },
    });

    return DeploymentRepo.preprocessConfig(deployment.config);
  }

  private static encryptEnv(
    config: PrismaWorkloadConfigCreate,
  ): WorkloadConfigCreateInput {
    const copy = structuredClone(config) as WorkloadConfigCreateInput;
    copy.envKey = generateKey();
    copy.env = encryptEnv(copy.env, copy.envKey);
    return copy;
  }

  static preprocessConfig(config: {
    appType: AppType;
    workloadConfig?: Omit<PrismaWorkloadConfig, "id" | "deploymentConfigId">;
    helmConfig?: Omit<PrismaHelmConfig, "id" | "deploymentConfigId">;
  }): DeploymentConfig {
    if (config === null) {
      return null;
    }

    let obj: WorkloadConfig | HelmConfig;
    if (config.appType === "workload") {
      obj = DeploymentRepo.preprocessWorkloadConfig(config.workloadConfig);
    } else if (config.appType === "helm") {
      obj = {
        ...config.helmConfig,
        source: "HELM",
        appType: "helm",
      } satisfies HelmConfig;
    } else {
      return null;
    }

    const wrapped = {
      ...obj,
      asWorkloadConfig() {
        if (obj.appType === "workload") {
          return obj;
        } else {
          throw new Error("DeploymentConfig is not a WorkloadConfig");
        }
      },
      asHelmConfig() {
        if (obj.appType === "helm") {
          return obj;
        } else {
          throw new Error("DeploymentConfig is not a HelmConfig");
        }
      },
      asGitConfig() {
        return wrapped.asWorkloadConfig().asGitConfig();
      },
    } satisfies DeploymentConfig;

    return wrapped;
  }

  private static preprocessWorkloadConfig(
    config: Omit<PrismaWorkloadConfig, "id" | "deploymentConfigId">,
  ): WorkloadConfig {
    if (config === null) {
      return null;
    }
    const env = config.env;
    const key = config.envKey;

    delete config.envKey;
    delete config.env;

    const decrypted = decryptEnv(env, key);

    const obj = {
      ...config,
      appType: "workload",
      getEnv() {
        return decrypted;
      },
      displayEnv: decrypted.map((envVar) =>
        envVar.isSensitive ? { ...envVar, value: null } : envVar,
      ),
      asGitConfig() {
        if (config.source === "GIT") {
          return obj as GitConfig;
        } else {
          throw new Error("Workload is not deployed from Git");
        }
      },
    } satisfies WorkloadConfig;

    return obj;
  }

  static cloneWorkloadConfig(config: WorkloadConfig): WorkloadConfigCreate {
    if (config === null) {
      return null;
    }
    const { getEnv, displayEnv, asGitConfig, ...clonable } = config;
    const newConfig = structuredClone(clonable);
    const env = config.getEnv();
    return { ...newConfig, env };
  }

  async checkLogIngestSecret(deploymentId: number, logIngestSecret: string) {
    const count = await this.client.app.count({
      where: {
        deployments: { some: { id: deploymentId } },
        logIngestSecret: logIngestSecret,
      },
    });

    // TODO Move logIngestSecret from App to Deployment

    return count === 1;
  }

  async getLogs(
    deploymentId: number,
    cursor: number,
    type: LogType,
    limit: number,
  ): Promise<Log[]> {
    // Fetch them in reverse order so that we can take only the 500 most recent lines
    return (
      await this.client.log.findMany({
        where: {
          id: { gt: cursor },
          deploymentId: deploymentId,
          type: type,
        },
        orderBy: [{ timestamp: "desc" }, { index: "desc" }],
        take: limit,
      })
    ).reverse();
  }

  async insertLogs(logs: Omit<Log, "id">[]) {
    await this.client.log.createMany({
      data: logs,
    });

    const deploymentIds = new Set<number>();
    for (const log of logs) {
      deploymentIds.add(log.deploymentId);
    }

    for (const deploymentId of deploymentIds) {
      if (typeof deploymentId !== "number") {
        continue;
      }
      await this.publish(`deployment_${deploymentId}_logs`, "");
    }
  }

  async unlinkRepositoryFromAllDeployments(repoId: number) {
    await this.client.workloadConfig.updateMany({
      where: { repositoryId: repoId },
      data: { repositoryId: null, branch: null, source: "IMAGE" },
    });
  }

  async getNextInQueue(): Promise<Deployment | null> {
    const [result] = await this.client.$queryRaw<{ id: number }[]>`
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

    if (!result) {
      return null; // Queue is empty
    }

    const deploymentId = result.id;
    const deployment = await this.getById(deploymentId);

    return deployment;
  }

  async setStatus(deploymentId: number, status: DeploymentStatus) {
    await this.client.deployment.update({
      where: { id: deploymentId },
      data: { status },
    });
  }

  async setCheckRunId(deploymentId: number, checkRunId: number) {
    await this.client.deployment.update({
      where: { id: deploymentId },
      data: { checkRunId },
    });
  }

  async listForApp(
    appId: number,
    page: number,
    pageSize: number,
  ): Promise<DeploymentWithSourceInfo[]> {
    const deployments = await this.client.deployment.findMany({
      where: {
        app: { id: appId },
      },
      include: {
        config: {
          select: {
            appType: true,
            workloadConfig: true,
            helmConfig: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: page * pageSize,
      take: pageSize,
    });

    return deployments.map((deployment) => ({
      ...deployment,
      config: undefined,
      appType: deployment.config.appType,
      source: deployment.config.workloadConfig?.source,
      commitHash: deployment.config.workloadConfig?.commitHash,
      imageTag: deployment.config.workloadConfig?.imageTag,
      repositoryId: deployment.config.workloadConfig?.repositoryId,
    }));
  }
}
