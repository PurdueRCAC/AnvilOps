import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";
import { randomBytes } from "node:crypto";
import {
  DeploymentSource,
  type DeploymentStatus,
  type PermissionLevel,
  type WebhookEvent,
} from "../../generated/prisma/enums.ts";
import {
  ConflictError,
  NotFoundError,
  type PrismaClientType,
} from "../index.ts";
import type {
  App,
  AppCreate,
  Deployment,
  DeploymentConfig,
} from "../models.ts";
import { DeploymentRepo } from "./deployment.ts";

export class AppRepo {
  private client: PrismaClientType;

  constructor(client: PrismaClientType) {
    this.client = client;
  }

  async getById(
    appId: number,
    options?: {
      requireUser?: { id: number; permissionLevel?: PermissionLevel };
    },
  ): Promise<App | null> {
    return await this.client.app.findUnique({
      where: {
        id: appId,
        ...(options?.requireUser
          ? {
              org: {
                users: {
                  some: {
                    userId: options.requireUser.id,
                    permissionLevel: options.requireUser.permissionLevel,
                  },
                },
              },
            }
          : {}),
      },
    });
  }

  async listFromConnectedRepo(
    repoId: number,
    event: WebhookEvent,
    branch: string,
    eventId?: number,
  ) {
    return await this.client.app.findMany({
      where: {
        config: {
          source: DeploymentSource.GIT,
          repositoryId: repoId,
          event,
          eventId,
          branch,
        },
        org: { githubInstallationId: { not: null } },
        enableCD: true,
      },
    });
  }

  async isSubdomainInUse(subdomain: string): Promise<boolean> {
    return (
      (await this.client.app.count({ where: { subdomain: subdomain } })) > 0
    );
  }

  async listForOrg(orgId: number): Promise<App[]> {
    return await this.client.app.findMany({ where: { orgId: orgId } });
  }

  async getDeploymentCount(appId: number): Promise<number> {
    return await this.client.deployment.count({ where: { appId: appId } });
  }

  async create(appData: AppCreate): Promise<App> {
    const result = await this.client.$transaction(async (tx) => {
      let app: { id: number };
      try {
        app = await tx.app.create({
          data: {
            name: appData.name,
            displayName: appData.name,
            subdomain: appData.subdomain,
            org: {
              connect: {
                id: appData.orgId,
              },
            },

            // This cluster username will be used to automatically update the app after a build job or webhook payload
            // TODO: make this a setting in the UI
            clusterUsername: appData.clusterUsername,
            projectId: appData.projectId,
            logIngestSecret: randomBytes(48).toString("hex"),
            appGroup: { connect: { id: appData.appGroupId } },
          },
          select: { id: true },
        });
      } catch (err) {
        if (
          err instanceof PrismaClientKnownRequestError &&
          err.code === "P2002"
        ) {
          // P2002 is "Unique Constraint Failed" - https://www.prisma.io/docs/orm/reference/error-reference#p2002
          throw new ConflictError(
            err.meta?.target as string /* column name */,
            err,
          );
        }
      }

      // Use the new app's ID to generate the imageRepo field
      return await tx.app.update({
        where: { id: app.id },
        data: { imageRepo: `app-${appData.orgId}-${app.id}` },
      });
    });

    return result;
  }

  async delete(appId: number) {
    await this.client.$transaction(async (tx) => {
      await tx.log.deleteMany({
        where: { deployment: { appId: appId } },
      });
      await tx.deploymentConfig.deleteMany({
        // This query deletes each DeploymentConfig's associated Deployment
        where: { app: { id: appId } },
      });
      const app = await tx.app.delete({
        where: { id: appId },
        select: { appGroupId: true },
      });

      const appsRemaining = await tx.app.count({
        where: { id: { not: appId }, appGroupId: app.appGroupId },
      });

      if (appsRemaining === 0) {
        // We removed the last app in the group; remove the group as well
        await tx.appGroup.delete({ where: { id: app.appGroupId } });
      }
    });
  }

  async getMostRecentDeployment(appId: number): Promise<Deployment> {
    return await this.client.deployment.findFirst({
      where: { appId: appId },
      orderBy: { createdAt: "desc" },
      take: 1,
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

  async getCurrentDeployment(appId: number): Promise<Deployment> {
    // App -> most recent DeploymentConfig -> id of linked Deployment
    const app = await this.client.app.findUnique({
      where: { id: appId },
      select: {
        config: {
          select: {
            deployment: {
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
            },
          },
        },
      },
    });

    return app.config.deployment;
  }

  async getDeploymentConfig(appId: number): Promise<DeploymentConfig> {
    const app = await this.client.app.findUnique({
      where: { id: appId },
      include: { config: true },
    });

    return DeploymentRepo.preprocessDeploymentConfig(app.config);
  }

  async setConfig(appId: number, configId: number) {
    await this.client.app.update({
      where: { id: appId },
      data: {
        config: { connect: { id: configId } },
      },
    });
  }

  async setEnableCD(appId: number, enableCD: boolean) {
    await this.client.app.update({ where: { id: appId }, data: { enableCD } });
  }

  async getDeploymentsWithStatus(appId: number, statuses: DeploymentStatus[]) {
    return await this.client.deployment.findMany({
      where: {
        appId: appId,
        status: {
          in: statuses,
        },
      },
      include: {
        config: true,
      },
    });
  }

  async setGroup(appId: number, appGroupId: number) {
    try {
      await this.client.$transaction(async (tx) => {
        const originalGroupId = (
          await tx.app.findUnique({
            where: { id: appId },
            select: { appGroupId: true },
          })
        ).appGroupId;

        // Move the app to the new group
        await tx.app.update({
          where: { id: appId },
          data: {
            appGroup: {
              connect: { id: appGroupId },
            },
          },
        });

        // If the old group will now be empty, delete it
        const remainingApps = await tx.app.count({
          where: { appGroupId: originalGroupId },
        });

        if (remainingApps === 0) {
          await tx.appGroup.delete({ where: { id: originalGroupId } });
        }
      });
    } catch (err) {
      if (
        err instanceof PrismaClientKnownRequestError &&
        err.code === "P2025"
      ) {
        // https://www.prisma.io/docs/orm/reference/error-reference#p2025
        // "An operation failed because it depends on one or more records that were required but not found. {cause}"
        throw new NotFoundError("appGroup");
      }
      throw err;
    }
  }

  async update(
    appId: number,
    updates: {
      displayName?: string;
      clusterUsername?: string | null;
      projectId?: string | null;
      enableCD?: boolean;
    },
  ) {
    await this.client.app.update({ where: { id: appId }, data: updates });
  }
}
