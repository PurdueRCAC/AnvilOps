import { SpanStatusCode, trace } from "@opentelemetry/api";
import type {
  Deployment,
  DeploymentConfig,
  HelmConfigCreate,
  WorkloadConfigCreate,
} from "../db/models.ts";
import type { AppRepo } from "../db/repo/app.ts";
import type { AppGroupRepo } from "../db/repo/appGroup.ts";
import type { OrganizationRepo } from "../db/repo/organization.ts";
import type { UserRepo } from "../db/repo/user.ts";
import type { components } from "../generated/openapi.ts";
import { logger } from "../logger.ts";
import type { AppService } from "./common/app.ts";
import {
  MAX_GROUPNAME_LEN,
  RANDOM_TAG_LEN,
  getRandomTag,
} from "./common/cluster/resources.ts";
import type { DeploymentService } from "./common/deployment.ts";
import type { DeploymentConfigService } from "./common/deploymentConfig.ts";
import {
  AppNotFoundError,
  DeploymentError,
  ValidationError,
} from "./errors/index.ts";

export type AppUpdate = components["schemas"]["AppUpdate"];

export class UpdateAppService {
  private orgRepo: OrganizationRepo;
  private userRepo: UserRepo;
  private appRepo: AppRepo;
  private appGroupRepo: AppGroupRepo;
  private appService: AppService;
  private deploymentService: DeploymentService;
  private deploymentConfigService: DeploymentConfigService;

  constructor(
    orgRepo: OrganizationRepo,
    userRepo: UserRepo,
    appRepo: AppRepo,
    appGroupRepo: AppGroupRepo,
    appService: AppService,
    deploymentService: DeploymentService,
    deploymentConfigService: DeploymentConfigService,
  ) {
    this.orgRepo = orgRepo;
    this.userRepo = userRepo;
    this.appRepo = appRepo;
    this.appGroupRepo = appGroupRepo;
    this.appService = appService;
    this.deploymentService = deploymentService;
    this.deploymentConfigService = deploymentConfigService;
  }

  async updateApp(appId: number, userId: number, appData: AppUpdate) {
    const originalApp = await this.appRepo.getById(appId, {
      requireUser: { id: userId },
    });

    if (!originalApp) {
      throw new AppNotFoundError();
    }

    const [organization, user] = await Promise.all([
      this.orgRepo.getById(originalApp.orgId, { requireUser: { id: userId } }),
      this.userRepo.getById(userId),
    ]);

    // performs validation
    const { config: _config, commitMessage } = (
      await this.appService.prepareMetadataForApps(organization, user, {
        type: "update",
        existingAppId: originalApp.id,
        ...appData,
      })
    )[0];
    let updatedConfig = _config;

    // ---------------- App group updates ----------------
    if (appData.appGroup) {
      let appGroupId: number;
      switch (appData.appGroup?.type) {
        case "add-to": {
          if (appData.appGroup.id === originalApp.appGroupId) {
            break;
          }
          appGroupId = appData.appGroup.id;
          const group = await this.appGroupRepo.getById(appGroupId);
          if (!group) {
            throw new ValidationError("Invalid app group");
          }
          await this.appRepo.setGroup(originalApp.id, appGroupId);
          break;
        }

        case "create-new": {
          this.appService.validateAppGroupName(appData.appGroup.name);
          appGroupId = await this.appGroupRepo.create(
            originalApp.orgId,
            appData.appGroup.name,
            false,
          );
          await this.appRepo.setGroup(originalApp.id, appGroupId);
          break;
        }

        case "standalone": {
          if (appData.appGroup.type === "standalone") {
            break;
          }
          const groupName = `${originalApp.name.substring(0, MAX_GROUPNAME_LEN - RANDOM_TAG_LEN - 1)}-${getRandomTag()}`;
          this.appService.validateAppGroupName(groupName);
          appGroupId = await this.appGroupRepo.create(
            originalApp.orgId,
            groupName,
            true,
          );
          await this.appRepo.setGroup(originalApp.id, appGroupId);
          break;
        }

        default: {
          throw new ValidationError("Unexpected app group action type");
        }
      }

      logger.info(
        {
          orgId: organization.id,
          appId: originalApp.id,
          appGroupId: appGroupId,
        },
        "App group updated",
      );
    }

    // ---------------- App model updates ----------------

    const updates = {} as Record<string, string | boolean>;
    if (appData.displayName !== undefined) {
      updates.displayName = appData.displayName;
    }

    if (appData.projectId !== undefined) {
      updates.projectId = appData.projectId;
    }

    if (appData.enableCD !== undefined) {
      updates.enableCD = appData.enableCD;
    }

    if (Object.keys(updates).length > 0) {
      await this.appRepo.update(originalApp.id, updates);
      logger.info(
        { orgId: organization.id, appId: originalApp.id, updates },
        "App updated",
      );
    }

    const app = await this.appRepo.getById(originalApp.id);
    const [currentConfig, currentDeployment] = await Promise.all([
      this.appRepo.getDeploymentConfig(app.id),
      this.appRepo.getCurrentDeployment(app.id),
    ]);

    // Adds an image tag to Git configs
    updatedConfig = this.deploymentConfigService.populateImageTag(
      updatedConfig,
      app,
    );

    if (
      updatedConfig.appType === "workload" &&
      currentConfig.appType === "workload"
    ) {
      updatedConfig.env = withSensitiveEnv(
        currentConfig.getEnv(),
        updatedConfig.env,
      );
    }

    try {
      await this.deploymentService.create({
        appId: app.id,
        commitMessage,
        config: updatedConfig,
        git: {
          skipBuild:
            !appData.forceRebuild &&
            !shouldBuildOnUpdate(
              currentConfig,
              updatedConfig,
              currentDeployment,
            ),
        },
      });
      // When the new image is built and deployed successfully, it will become the imageTag of the app's template deployment config so that future redeploys use it.
    } catch (err) {
      const span = trace.getActiveSpan();
      span?.recordException(err as Error);
      span?.setStatus({
        code: SpanStatusCode.ERROR,
        message: "Failed to update app",
      });

      throw new DeploymentError(err as Error);
    }
    logger.info({ orgId: organization.id, appId: app.id }, "App updated");
  }
}

// Keep in sync with the isRebuildRequired function in frontend/src/pages/app/ConfigTab.tsx
function shouldBuildOnUpdate(
  oldConfig: DeploymentConfig,
  newConfig: WorkloadConfigCreate | HelmConfigCreate,
  currentDeployment: Deployment,
) {
  // Only Git apps need to be built
  if (newConfig.source !== "GIT") {
    return false;
  }

  // Either this app has not been built in the past, or it has not been built successfully
  if (
    oldConfig.source !== "GIT" ||
    !oldConfig.imageTag ||
    currentDeployment.status === "ERROR"
  ) {
    return true;
  }

  // The code has changed
  if (
    newConfig.branch !== oldConfig.branch ||
    newConfig.repositoryId != oldConfig.repositoryId ||
    newConfig.commitHash != oldConfig.commitHash
  ) {
    return true;
  }

  // Build options have changed
  if (
    newConfig.builder != oldConfig.builder ||
    newConfig.rootDir != oldConfig.rootDir ||
    (newConfig.builder === "dockerfile" &&
      newConfig.dockerfilePath != oldConfig.dockerfilePath)
  ) {
    return true;
  }

  return false;
}

// Patch the null(hidden) values of env vars sent from client with the sensitive plaintext
function withSensitiveEnv(
  lastPlaintextEnv: PrismaJson.EnvVar[],
  envVars: {
    name: string;
    value: string | null;
    isSensitive: boolean;
  }[],
) {
  const lastEnvMap: Record<string, string> =
    lastPlaintextEnv?.reduce((map, env) => {
      return Object.assign(map, { [env.name]: env.value });
    }, {}) ?? {};
  return envVars.map((env) =>
    env.value === null
      ? {
          name: env.name,
          value: lastEnvMap[env.name],
          isSensitive: env.isSensitive,
        }
      : env,
  );
}
