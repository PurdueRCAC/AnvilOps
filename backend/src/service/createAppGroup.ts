import { SpanStatusCode, trace } from "@opentelemetry/api";
import { ConflictError } from "../db/errors/index.ts";
import type { App } from "../db/models.ts";
import type { AppRepo } from "../db/repo/app.ts";
import type { AppGroupRepo } from "../db/repo/appGroup.ts";
import type { OrganizationRepo } from "../db/repo/organization.ts";
import type { UserRepo } from "../db/repo/user.ts";
import type { components } from "../generated/openapi.ts";
import { type NewApp } from "../service/createApp.ts";
import type { AppService } from "./common/app.ts";
import type { DeploymentService } from "./common/deployment.ts";
import { DeploymentConfigService } from "./common/deploymentConfig.ts";
import {
  AppCreateError,
  OrgNotFoundError,
  ValidationError,
} from "./errors/index.ts";

export type NewAppWithoutGroup =
  components["schemas"]["NewAppWithoutGroupInfo"];

export class CreateAppGroupService {
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

  async createAppGroup(
    userId: number,
    orgId: number,
    groupName: string,
    appData: NewAppWithoutGroup[],
  ) {
    this.appService.validateAppGroupName(groupName);
    const apps = appData.map(
      (app) =>
        ({
          ...app,
          orgId: orgId,
        }) satisfies Omit<NewApp, "appGroup">,
    );

    const [organization, user] = await Promise.all([
      this.orgRepo.getById(orgId, { requireUser: { id: userId } }),
      this.userRepo.getById(userId),
    ]);

    if (!organization) {
      throw new OrgNotFoundError(null);
    }

    // validate all apps before creating any
    const validationResults = await this.appService.prepareMetadataForApps(
      organization,
      user,
      ...appData.map((app) => ({
        type: "create" as const,
        ...app,
      })),
    );

    const appsWithMetadata = apps.map((app, idx) => ({
      appData: app,
      metadata: validationResults[idx],
    }));

    const groupId = await this.appGroupRepo.create(orgId, groupName, false);
    // let groupId: number;
    // try {
    //   groupId = await this.appGroupRepo.create(orgId, groupName, false);
    // } catch (e) {
    //   if (e instanceof ConflictError) {
    //     throw new ValidationError(
    //       "An app group already exists with the same name.",
    //     );
    //   }
    //   throw e;
    // }

    for (const { appData, metadata } of appsWithMetadata) {
      const { config: _config, commitMessage } = metadata;
      let config = _config;
      let app: App;
      try {
        app = await this.appRepo.create({
          orgId: appData.orgId,
          appGroupId: groupId,
          name: appData.name,
          clusterUsername: user.clusterUsername,
          projectId: appData.projectId,
          namespace: appData.namespace,
        });
        config = this.deploymentConfigService.populateImageTag(config, app);
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
          config,
        });
      } catch (err) {
        const span = trace.getActiveSpan();
        span?.recordException(err as Error);
        span?.setStatus({
          code: SpanStatusCode.ERROR,
          message:
            "Failed to create app's initial deployment while creating app group",
        });
        throw new AppCreateError(appData.name, err as Error);
      }
    }
  }
}
