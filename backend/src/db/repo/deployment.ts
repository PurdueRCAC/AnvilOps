import { randomBytes } from "node:crypto";
import type {
  DeploymentStatus,
  LogType,
  PermissionLevel,
} from "../../generated/prisma/enums.ts";
import { type DeploymentConfigModel as PrismaDeploymentConfig } from "../../generated/prisma/models/DeploymentConfig.ts";
import { decryptEnv } from "../crypto.ts";
import type { PrismaClientType } from "../index.ts";
import type {
  Deployment,
  DeploymentConfig,
  DeploymentConfigCreate,
  DeploymentWithSourceInfo,
  Log,
} from "../models.ts";

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
    config: DeploymentConfigCreate;
    commitMessage: string | null;
    workflowRunId?: number;
    status?: DeploymentStatus;
  }): Promise<Deployment> {
    return await this.client.deployment.create({
      data: {
        app: { connect: { id: appId } },
        config: { create: config },
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
      select: { config: true },
    });

    return DeploymentRepo.preprocessDeploymentConfig(deployment.config);
  }

  static preprocessDeploymentConfig(
    config: PrismaDeploymentConfig,
  ): DeploymentConfig {
    const env = config.env;
    const key = config.envKey;

    delete config.envKey;
    delete config.env;

    const decrypted = decryptEnv(env, key);

    return {
      ...config,
      getEnv() {
        return decrypted;
      },
      displayEnv: decrypted.map((envVar) =>
        envVar.isSensitive ? { ...envVar, value: null } : envVar,
      ),
    };
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
    await this.client.deploymentConfig.updateMany({
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
            source: true,
            commitHash: true,
            imageTag: true,
            repositoryId: true,
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
      source: deployment.config.source,
      commitHash: deployment.config.commitHash,
      imageTag: deployment.config.imageTag,
      repositoryId: deployment.config.repositoryId,
    }));
  }
}
