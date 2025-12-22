import { Octokit } from "octokit";
import {
  GitConfigCreate,
  HelmConfigCreate,
  WorkloadConfigCreate,
} from "../db/models.ts";
import { components } from "../generated/openapi.ts";
import { getOctokit, getRepoById } from "../lib/octokit.ts";
import { type DeploymentConfigValidator } from "./deploymentConfig.ts";
import { deploymentConfigValidator } from "./index.ts";
import { GitWorkloadConfig } from "./types.ts";

export class DeploymentController {
  private readonly validator: DeploymentConfigValidator;
  private readonly getOctokitFn: typeof getOctokit;
  private readonly getRepoByIdFn: typeof getRepoById;

  constructor(
    validator: DeploymentConfigValidator,
    getOctokitFn?: typeof getOctokit,
    getRepoByIdFn?: typeof getRepoById,
  ) {
    this.validator = validator;
    this.getOctokitFn = getOctokitFn ?? getOctokit;
    this.getRepoByIdFn = getRepoByIdFn ?? getRepoById;
  }

  async prepareDeploymentMetadata(
    config: components["schemas"]["DeploymentConfig"],
    orgId: number,
  ): Promise<{
    config: GitConfigCreate | HelmConfigCreate | WorkloadConfigCreate;
    commitMessage: string;
  }> {
    let commitHash = "unknown",
      commitMessage = "Initial deployment";

    switch (config.source) {
      case "git": {
        let octokit: Octokit, repo: Awaited<ReturnType<typeof getRepoById>>;

        try {
          octokit = await this.getOctokitFn(orgId);
          repo = await this.getRepoByIdFn(octokit, config.repositoryId);
        } catch (err) {
          if (err.status === 404) {
            throw new Error("Invalid repository id");
          }

          console.error(err);
          throw new Error("Failed to look up GitHub repository");
        }

        await this.validator.validateGitConfig(config, octokit, repo);

        const latestCommit = (
          await octokit.rest.repos.listCommits({
            per_page: 1,
            owner: repo.owner.login,
            repo: repo.name,
          })
        ).data[0];

        commitHash = latestCommit.sha;
        commitMessage = latestCommit.commit.message;

        return {
          config: await this.createGitConfig(config, commitHash, repo.id),
          commitMessage,
        };
      }
      case "image": {
        deploymentConfigValidator.validateImageConfig(config);
        return {
          config: {
            ...this.createCommonWorkloadConfig(config),
            source: "IMAGE",
          },
          commitMessage,
        };
      }
      case "helm": {
        return { config: { ...config, source: "HELM" }, commitMessage };
      }
    }
  }

  createCommonWorkloadConfig(
    config: components["schemas"]["WorkloadConfigOptions"],
  ) {
    return {
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

  async createGitConfig(
    config: GitWorkloadConfig,
    commitHash: string,
    repositoryId: number,
  ): Promise<GitConfigCreate> {
    return {
      ...this.createCommonWorkloadConfig(config),
      source: "GIT",
      repositoryId,
      branch: config.branch,
      event: config.event,
      commitHash,
      builder: config.builder,
      imageTag: undefined,
    } satisfies GitConfigCreate;
  }
}
