import { SpanStatusCode, trace } from "@opentelemetry/api";
import { ConflictError } from "../db/errors/index.ts";
import type { App } from "../db/models.ts";
import type { AppRepo } from "../db/repo/app.ts";
import type { AppGroupRepo } from "../db/repo/appGroup.ts";
import type { OrganizationRepo } from "../db/repo/organization.ts";
import type { UserRepo } from "../db/repo/user.ts";
import type { components } from "../generated/openapi.ts";
import {
  MAX_GROUPNAME_LEN,
  RANDOM_TAG_LEN,
  getRandomTag,
} from "../lib/cluster/resources.ts";
import { logger } from "../logger.ts";
import type { AppService } from "./common/app.ts";
import type { DeploymentService } from "./common/deployment.ts";
import type { DeploymentConfigService } from "./common/deploymentConfig.ts";
import {
  DeploymentError,
  OrgNotFoundError,
  ValidationError,
} from "./errors/index.ts";

export type NewApp = components["schemas"]["NewApp"];

export class CreateAppService {
  private orgRepo: OrganizationRepo;
  private appRepo: AppRepo;
  private appGroupRepo: AppGroupRepo;
  private userRepo: UserRepo;
  private appService: AppService;
  private deploymentService: DeploymentService;
  private deploymentConfigService: DeploymentConfigService;

  constructor(
    orgRepo: OrganizationRepo,
    appRepo: AppRepo,
    appGroupRepo: AppGroupRepo,
    userRepo: UserRepo,
    appService: AppService,
    deploymentService: DeploymentService,
    deploymentConfigService: DeploymentConfigService,
  ) {
    this.orgRepo = orgRepo;
    this.appRepo = appRepo;
    this.appGroupRepo = appGroupRepo;
    this.userRepo = userRepo;
    this.appService = appService;
    this.deploymentService = deploymentService;
    this.deploymentConfigService = deploymentConfigService;
  }

  async createApp(appData: NewApp, userId: number) {
    const [organization, user] = await Promise.all([
      this.orgRepo.getById(appData.orgId, { requireUser: { id: userId } }),
      this.userRepo.getById(userId),
    ]);

    if (!organization) {
      throw new OrgNotFoundError(null);
    }

    let app: App;

    const { config, commitMessage } = (
      await this.appService.prepareMetadataForApps(organization, user, {
        type: "create",
        ...appData,
      })
    )[0];

    let appGroupId: number;

    switch (appData.appGroup.type) {
      case "add-to": {
        const group = await this.appGroupRepo.getById(appData.appGroup.id);
        if (!group) {
          throw new ValidationError("Invalid app group");
        }
        appGroupId = appData.appGroup.id;
        break;
      }

      case "create-new": {
        this.appService.validateAppGroupName(appData.appGroup.name);
        appGroupId = await this.appGroupRepo.create(
          appData.orgId,
          appData.appGroup.name,
          false,
        );
        break;
      }

      case "standalone": {
        const groupName = `${appData.name.substring(0, MAX_GROUPNAME_LEN - RANDOM_TAG_LEN - 1)}-${getRandomTag()}`;
        this.appService.validateAppGroupName(groupName);
        appGroupId = await this.appGroupRepo.create(
          appData.orgId,
          groupName,
          true,
        );
        break;
      }

      default: {
        appData.appGroup satisfies never; // Make sure switch is exhaustive
      }
    }

    let deploymentConfig = config;

    try {
      app = await this.appRepo.create({
        orgId: appData.orgId,
        appGroupId: appGroupId,
        name: appData.name,
        clusterUsername: user.clusterUsername,
        projectId: appData.projectId,
        namespace: appData.namespace,
      });

      logger.info({ orgId: appData.orgId, appId: app.id }, "App created");

      deploymentConfig = this.deploymentConfigService.populateImageTag(
        deploymentConfig,
        app,
      );
    } catch (err) {
      // In between validation and creating the app, the namespace was taken by another app
      if (err instanceof ConflictError && err.message === "namespace") {
        throw new ValidationError("Namespace is unavailable");
      }
      throw err;
    }

    try {
      await this.deploymentService.create({
        org: organization,
        app,
        commitMessage,
        config: deploymentConfig,
      });
    } catch (err) {
      const span = trace.getActiveSpan();
      span?.recordException(err as Error);
      span?.setStatus({ code: SpanStatusCode.ERROR });
      throw new DeploymentError(err as Error);
    }
    return app.id;
  }
}
