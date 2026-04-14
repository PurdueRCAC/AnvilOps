import type {
  App,
  Deployment,
  DeploymentConfig,
  GitConfig,
  GitConfigCreate,
  HelmConfigCreate,
  Organization,
  WorkloadConfig,
  WorkloadConfigCreate,
} from "../../db/models.ts";
import type { AppRepo } from "../../db/repo/app.ts";
import type { components } from "../../generated/openapi.ts";
import { isRFC1123 } from "../../lib/validate.ts";
import {
  InstallationNotFoundError,
  RepositoryNotFoundError,
  ValidationError,
} from "../errors/index.ts";
import { MAX_SUBDOMAIN_LEN } from "./cluster/resources.ts";
import type { IngressConfigService } from "./cluster/resources/ingress.ts";
import type { StatefulSetConfigService } from "./cluster/resources/statefulset.ts";
import type {
  GitProvider,
  GitProviderFactoryService,
  GitRepository,
} from "./git/gitProvider.ts";
import type { RegistryService } from "./registry.ts";

type GitWorkloadConfig = components["schemas"]["WorkloadConfigOptions"] & {
  source: "git";
};

type ImageWorkloadConfig = components["schemas"]["WorkloadConfigOptions"] & {
  source: "image";
};

export class DeploymentConfigService {
  private appRepo: AppRepo;
  private gitProviderFactoryService: GitProviderFactoryService;
  private registryService: RegistryService;
  private ingressConfigService: IngressConfigService;
  private statefulSetConfigService: StatefulSetConfigService;
  private appDomain: string;
  private registryHostname: string;
  private harborProjectName: string;

  constructor(
    appRepo: AppRepo,
    gitProviderFactoryService: GitProviderFactoryService,
    registryService: RegistryService,
    ingressConfigService: IngressConfigService,
    statefulSetConfigService: StatefulSetConfigService,
    appDomain: string,
    registryHostname: string,
    harborProjectName: string,
  ) {
    this.appRepo = appRepo;
    this.gitProviderFactoryService = gitProviderFactoryService;
    this.registryService = registryService;
    this.ingressConfigService = ingressConfigService;
    this.statefulSetConfigService = statefulSetConfigService;
    this.appDomain = appDomain;
    this.registryHostname = registryHostname;
    this.harborProjectName = harborProjectName;
  }

  async prepareDeploymentMetadata(
    config: components["schemas"]["DeploymentConfig"],
    organization: Pick<Organization, "id">,
  ): Promise<{
    config: GitConfigCreate | HelmConfigCreate | WorkloadConfigCreate;
    commitMessage: string | null;
  }> {
    switch (config.source) {
      case "git": {
        let gitProvider: GitProvider, repo: GitRepository;

        try {
          gitProvider = await this.gitProviderFactoryService.getGitProvider(
            organization.id,
          );
        } catch (err) {
          if (err instanceof InstallationNotFoundError) {
            throw new ValidationError(
              "Organization is not connected to a Git provider.",
            );
          }

          throw new Error("Failed to look up Git repository", {
            cause: err,
          });
        }

        try {
          repo = await gitProvider.getRepoById(config.repositoryId);
        } catch (err) {
          if (err instanceof RepositoryNotFoundError) {
            throw new ValidationError("Repository not found");
          }
          throw err;
        }

        await this.validateGitConfig(config, gitProvider);

        let commitHash: string;
        let commitMessage: string;
        if (config.commitHash) {
          commitHash = config.commitHash;
          commitMessage = await gitProvider.getCommitMessage(
            config.repositoryId,
            commitHash,
          );
        } else {
          const latestCommit = await gitProvider.getLatestCommit(
            config.repositoryId,
            config.branch,
          );
          commitHash = latestCommit.sha;
          commitMessage = latestCommit.message;
        }

        return {
          config: this.createGitConfig(config, commitHash, repo.id),
          commitMessage,
        };
      }
      case "image": {
        await this.validateImageConfig(config);
        return {
          config: {
            ...this.createCommonWorkloadConfig(config),
            source: "IMAGE",
            appType: "workload",
          },
          commitMessage: null,
        };
      }
      case "helm": {
        return {
          config: { ...config, source: "HELM", appType: "helm" },
          commitMessage: null,
        };
      }
      default: {
        config satisfies never; // Make sure switch is exhaustive
        throw new ValidationError("Invalid deployment config type");
      }
    }
  }

  /**
   * @returns If source is GIT, a `ConfigCreate` object with the image tag where
   *          the built image will be pushed, the original config otherwise
   */
  populateImageTag(
    config: GitConfigCreate | HelmConfigCreate | WorkloadConfigCreate,
    app: App,
  ) {
    if (config.source === "GIT") {
      return {
        ...config,
        imageTag: `${this.registryHostname}/${this.harborProjectName}/${app.imageRepo}:${config.commitHash}`,
      } satisfies WorkloadConfigCreate;
    }

    return config;
  }

  private cloneWorkloadConfig(config: WorkloadConfig): WorkloadConfigCreate {
    if (config === null) {
      return null;
    }

    const {
      // eslint-disable-next-line @typescript-eslint/unbound-method -- This function is unused
      getEnv: _getEnv,
      // eslint-disable-next-line @typescript-eslint/unbound-method -- This function is unused
      asGitConfig: _asGitConfig,
      displayEnv: _displayEnv,
      ...rest
    } = config;

    const newConfig = structuredClone(rest);

    const env = config.getEnv();
    return { ...newConfig, env };
  }

  populateNewCommit(config: GitConfig, app: App, commitHash: string) {
    return this.populateImageTag(
      {
        ...this.cloneWorkloadConfig(config),
        commitHash,
      },
      app,
    );
  }

  private createCommonWorkloadConfig(
    config: components["schemas"]["WorkloadConfigOptions"],
  ) {
    return {
      appType: "workload" as const,
      collectLogs: config.collectLogs,
      createIngress: config.createIngress,
      subdomain: config.subdomain,
      env: config.env,
      requests: config.requests,
      limits: config.limits,
      replicas: config.replicas,
      port: config.port,
      mounts: config.mounts,
      commitHash: "unknown",
      imageTag: config.imageTag,
    };
  }

  private createGitConfig(
    config: GitWorkloadConfig,
    commitHash: string,
    repositoryId: number,
  ): GitConfigCreate {
    return {
      ...this.createCommonWorkloadConfig(config),
      source: "GIT",
      repositoryId,
      branch: config.branch,
      event: config.event,
      eventId: config.eventId,
      commitHash,
      builder: config.builder,
      dockerfilePath: config.dockerfilePath,
      rootDir: config.rootDir,
      imageTag: undefined,
    } satisfies GitConfigCreate;
  }

  /**
   * Produces a `DeploymentConfig` object to be returned from the API, as described in the OpenAPI spec.
   */
  formatDeploymentConfig(
    config: DeploymentConfig,
  ): components["schemas"]["DeploymentConfig"] {
    if (config.appType === "workload") {
      return this.formatWorkloadConfig(config);
    } else {
      return {
        ...config,
        source: "helm",
      };
    }
  }

  private formatWorkloadConfig(
    config: WorkloadConfig,
  ): components["schemas"]["WorkloadConfigOptions"] {
    return {
      appType: "workload",
      createIngress: config.createIngress,
      subdomain: config.createIngress ? config.subdomain : null,
      collectLogs: config.collectLogs,
      port: config.port,
      env: config.displayEnv,
      replicas: config.replicas,
      requests: config.requests,
      limits: config.limits,
      mounts: config.mounts.map((mount) => ({
        amountInMiB: mount.amountInMiB,
        path: mount.path,
        volumeClaimName: this.statefulSetConfigService.generateVolumeName(
          mount.path,
        ),
      })),
      ...(config.source === "GIT"
        ? {
            source: "git" as const,
            branch: config.branch,
            dockerfilePath: config.dockerfilePath,
            rootDir: config.rootDir,
            builder: config.builder,
            repositoryId: config.repositoryId,
            event: config.event,
            eventId: config.eventId,
            commitHash: config.commitHash,
          }
        : {
            source: "image" as const,
            imageTag: config.imageTag,
          }),
    };
  }

  async generateAutomaticEnvVars(
    gitProvider: GitProvider | null,
    deployment: Deployment,
    config: WorkloadConfig,
    app: App,
  ): Promise<{ name: string; value: string }[]> {
    const appDomain = URL.parse(this.appDomain);
    const list = [
      {
        name: "PORT",
        value: config.port.toString(),
        isSensitive: false,
      },
      {
        name: "ANVILOPS_CLUSTER_HOSTNAME",
        value: `${app.namespace}.${app.namespace}.svc.cluster.local`,
      },
      {
        name: "ANVILOPS_APP_NAME",
        value: app.displayName,
      },
      {
        name: "ANVILOPS_SUBDOMAIN",
        value: config.subdomain,
      },
      {
        name: "ANVILOPS_APP_ID",
        value: app.id.toString(),
      },
      {
        name: "ANVILOPS_DEPLOYMENT_ID",
        value: deployment.id.toString(),
      },
      {
        name: "ANVILOPS_DEPLOYMENT_SOURCE",
        value: config.source,
      },
      {
        name: "ANVILOPS_IMAGE_TAG",
        value: config.imageTag,
      },
    ];

    if (gitProvider && config.source === "GIT") {
      const repo = await gitProvider.getRepoById(config.repositoryId);
      list.push({
        name: "ANVILOPS_REPOSITORY_ID",
        value: config.repositoryId.toString(),
      });
      list.push({ name: "ANVILOPS_REPOSITORY_OWNER", value: repo.owner });
      list.push({ name: "ANVILOPS_REPOSITORY_NAME", value: repo.name });
      list.push({
        name: "ANVILOPS_REPOSITORY_SLUG",
        value: `${repo.owner}/${repo.name}`,
      });
      list.push({
        name: "ANVILOPS_COMMIT_HASH",
        value: config.commitHash,
      });
      list.push({
        name: "ANVILOPS_COMMIT_MESSAGE",
        value: deployment.commitMessage,
      });
    }

    if (appDomain !== null && config.createIngress) {
      const hostname = `${config.subdomain}.${appDomain.host}`;
      list.push({
        name: "ANVILOPS_HOSTNAME",
        value: hostname,
      });
      list.push({
        name: "ANVILOPS_URL",
        value: new URL(`${appDomain.protocol}//${hostname}`).toString(),
      });
    }

    return list;
  }

  async validateCommonWorkloadConfig(
    config: components["schemas"]["WorkloadConfigOptions"],
    existingAppId?: number,
  ) {
    if (config.subdomain) {
      await this.validateSubdomain(config.subdomain, existingAppId);
    }

    if (config.port < 0 || config.port > 65535) {
      throw new ValidationError(
        "Invalid port number: must be between 0 and 65535",
      );
    }

    this.validateEnv(config.env);

    this.validateMounts(config.mounts);
  }

  async validateGitConfig(config: GitWorkloadConfig, gitProvider: GitProvider) {
    const { rootDir, builder, dockerfilePath, event, eventId } = config;
    if (rootDir.startsWith("/") || rootDir.includes(`"`)) {
      throw new ValidationError("Invalid root directory");
    }
    if (builder === "dockerfile") {
      if (!dockerfilePath) {
        throw new ValidationError("Dockerfile path is required");
      }
      if (dockerfilePath.startsWith("/") || dockerfilePath.includes(`"`)) {
        throw new ValidationError("Invalid Dockerfile path");
      }
    }

    if (event === "workflow_run" && eventId === undefined) {
      throw new ValidationError("Workflow ID is required");
    }

    if (config.event === "workflow_run" && config.eventId) {
      try {
        const workflows = await gitProvider.getWorkflows(config.repositoryId);
        if (!workflows.some((workflow) => workflow.id === config.eventId)) {
          throw new ValidationError("Workflow not found");
        }
      } catch (err) {
        throw new ValidationError("Failed to look up workflow", { cause: err });
      }
    }
  }

  async validateImageConfig(config: ImageWorkloadConfig) {
    if (!config.imageTag) {
      throw new ValidationError("Image tag is required");
    }

    await this.validateImageReference(config.imageTag);
  }

  private validateMounts(
    mounts: components["schemas"]["KnownDeploymentOptions"]["mounts"],
  ) {
    const pathSet = new Set();
    for (const mount of mounts) {
      if (!mount.path.startsWith("/")) {
        throw new ValidationError(
          `Invalid mount path ${mount.path}: must start with '/'`,
        );
      }

      if (pathSet.has(mount.path)) {
        throw new ValidationError(`Invalid mounts: paths are not unique`);
      }
      pathSet.add(mount.path);
    }
  }

  private validateEnv(env: PrismaJson.EnvVar[]) {
    if (env?.some((it) => !it.name || it.name.length === 0)) {
      throw new ValidationError("Some environment variable(s) are empty");
    }

    if (env?.some((it) => it.name.startsWith("_PRIVATE_ANVILOPS_"))) {
      // Environment variables with this prefix are used in the log shipper - see log-shipper/main.go
      throw new ValidationError(
        'Environment variable(s) use reserved prefix "_PRIVATE_ANVILOPS_"',
      );
    }

    const envNames = new Set();

    for (const envVar of env) {
      if (envNames.has(envVar.name)) {
        throw new ValidationError(
          "Duplicate environment variable " + envVar.name,
        );
      }
      envNames.add(envVar.name);
    }
  }

  private async validateImageReference(reference: string) {
    try {
      // Look up the image in its registry to make sure it exists
      await this.registryService.getImageConfig(reference);
    } catch (err) {
      throw new ValidationError("Image could not be found in its registry.", {
        cause: err,
      });
    }
  }

  private async validateSubdomain(subdomain: string, existingAppId?: number) {
    if (!isRFC1123(subdomain)) {
      throw new ValidationError(
        "Subdomain must contain only lowercase alphanumeric characters or '-', " +
          "start and end with an alphanumeric character, " +
          `and contain at most ${MAX_SUBDOMAIN_LEN} characters`,
      );
    }

    const appWithSubdomain = await this.appRepo.getAppBySubdomain(subdomain);
    if (appWithSubdomain) {
      if (appWithSubdomain.id !== existingAppId) {
        throw new ValidationError(
          "Subdomain is in use by another AnvilOps app",
        );
      }
    } else {
      if (!(await this.ingressConfigService.canCreateIngress(subdomain))) {
        throw new ValidationError("Subdomain is in use");
      }
    }
  }
}
