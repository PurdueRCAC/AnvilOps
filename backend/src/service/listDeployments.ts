import type { DeploymentWithSourceInfo } from "../db/models.ts";
import type { AppRepo } from "../db/repo/app.ts";
import type { DeploymentRepo } from "../db/repo/deployment.ts";
import type { OrganizationRepo } from "../db/repo/organization.ts";
import type { components } from "../generated/openapi.ts";
import type {
  GitProvider,
  GitProviderFactoryService,
} from "./common/git/gitProvider.ts";
import {
  AppNotFoundError,
  InstallationNotFoundError,
  RepositoryNotFoundError,
  ValidationError,
} from "./errors/index.ts";

export class ListDeploymentsService {
  private orgRepo: OrganizationRepo;
  private appRepo: AppRepo;
  private deploymentRepo: DeploymentRepo;
  private gitProviderFactoryService: GitProviderFactoryService;

  constructor(
    orgRepo: OrganizationRepo,
    appRepo: AppRepo,
    deploymentRepo: DeploymentRepo,
    gitProviderFactoryService: GitProviderFactoryService,
  ) {
    this.orgRepo = orgRepo;
    this.appRepo = appRepo;
    this.deploymentRepo = deploymentRepo;
    this.gitProviderFactoryService = gitProviderFactoryService;
  }

  async listDeployments(
    appId: number,
    userId: number,
    page: number,
    pageLength: number,
  ) {
    if (
      page < 0 ||
      pageLength <= 0 ||
      !Number.isInteger(page) ||
      !Number.isInteger(pageLength)
    ) {
      throw new ValidationError("Invalid page or page length.");
    }

    const app = await this.appRepo.getById(appId, {
      requireUser: { id: userId },
    });

    if (!app) {
      throw new AppNotFoundError();
    }

    const org = await this.orgRepo.getById(app.orgId);

    const deployments = await this.deploymentRepo.listForApp(
      app.id,
      page,
      pageLength,
    );

    const distinctRepoIDs = [
      ...new Set(deployments.map((it) => it.repositoryId).filter(Boolean)),
    ];
    let gitProvider: GitProvider;
    if (distinctRepoIDs.length > 0) {
      try {
        gitProvider = await this.gitProviderFactoryService.getGitProvider(
          org.id,
        );
      } catch (e) {
        if (!(e instanceof InstallationNotFoundError)) {
          throw e;
        }
      }
    }
    const repos = await Promise.all(
      distinctRepoIDs.map(async (id) => {
        if (id) {
          try {
            return gitProvider ? await gitProvider.getRepoById(id) : null;
          } catch (error) {
            if (error instanceof RepositoryNotFoundError) {
              // The repo couldn't be found. Either it doesn't exist or the installation doesn't have permission to see it.
              return undefined;
            }
            throw error; // Rethrow any other kind of error
          }
        }
        return undefined;
      }),
    );

    const modifiedDeployments = deployments as Array<
      Omit<DeploymentWithSourceInfo, "status"> & {
        status: components["schemas"]["AppSummary"]["status"];
      }
    >;

    let sawSuccess = false;
    for (const deployment of modifiedDeployments) {
      if (deployment.status === "COMPLETE") {
        if (!sawSuccess) {
          sawSuccess = true;
        } else {
          deployment.status = "STOPPED";
        }
      }
    }

    return modifiedDeployments.map((deployment) => {
      return {
        id: deployment.id,
        appId: deployment.appId,
        repositoryURL:
          repos[distinctRepoIDs.indexOf(deployment.repositoryId)]?.htmlURL,
        commitHash: deployment.commitHash,
        commitMessage: deployment.commitMessage,
        status: deployment.status,
        createdAt: deployment.createdAt.toISOString(),
        updatedAt: deployment.updatedAt.toISOString(),
        source: deployment.source,
        imageTag: deployment.imageTag,
        chartUrl: deployment.chartUrl,
        chartVersion: deployment.chartVersion,
      };
    });
  }
}
