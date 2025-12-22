import { Octokit } from "octokit";
import { AppRepo } from "../db/repo/app.ts";
import { components } from "../generated/openapi.ts";
import { MAX_SUBDOMAIN_LEN } from "../lib/cluster/resources.ts";
import { getImageConfig } from "../lib/cluster/resources/logs.ts";
import { getRepoById } from "../lib/octokit.ts";
import { isRFC1123 } from "../lib/validate.ts";
import { GitWorkloadConfig, ImageWorkloadConfig } from "./types.ts";

export class DeploymentConfigValidator {
  private appRepo: AppRepo;
  constructor(appRepo: AppRepo) {
    this.appRepo = appRepo;
  }

  async validateCommonWorkloadConfig(
    config: components["schemas"]["WorkloadConfigOptions"],
  ) {
    if (config.subdomain) {
      await this.validateSubdomain(config.subdomain);
    }

    if (config.port < 0 || config.port > 65535) {
      throw new Error("Invalid port number: must be between 0 and 65535");
    }

    this.validateEnv(config.env);

    this.validateMounts(config.mounts);
  }

  async validateGitConfig(
    config: GitWorkloadConfig,
    octokit: Octokit,
    repo: Awaited<ReturnType<typeof getRepoById>>,
  ) {
    const { rootDir, builder, dockerfilePath, event, eventId } = config;
    if (rootDir.startsWith("/") || rootDir.includes(`"`)) {
      throw new Error("Invalid root directory");
    }
    if (builder === "dockerfile") {
      if (!dockerfilePath) {
        throw new Error("Dockerfile path is required");
      }
      if (dockerfilePath.startsWith("/") || dockerfilePath.includes(`"`)) {
        throw new Error("Invalid Dockerfile path");
      }
    }

    if (event === "workflow_run" && eventId === undefined) {
      throw new Error("Workflow ID is required");
    }

    if (config.event === "workflow_run" && config.eventId) {
      try {
        const workflows = await (
          octokit.request({
            method: "GET",
            url: `/repositories/${repo.id}/actions/workflows`,
          }) as ReturnType<typeof octokit.rest.actions.listRepoWorkflows>
        ).then((res) => res.data.workflows);
        if (!workflows.some((workflow) => workflow.id === config.eventId)) {
          throw new Error("Workflow not found");
        }
      } catch (err) {
        throw new Error("Failed to look up GitHub workflow");
      }
    }
  }

  async validateImageConfig(config: ImageWorkloadConfig) {
    if (!config.imageTag) {
      throw new Error("Image tag is required");
    }

    await this.validateImageReference(config.imageTag);
  }

  private validateMounts(
    mounts: components["schemas"]["KnownDeploymentOptions"]["mounts"],
  ) {
    const pathSet = new Set();
    for (const mount of mounts) {
      if (!mount.path.startsWith("/")) {
        throw new Error(
          `Invalid mount path ${mount.path}: must start with '/'`,
        );
      }

      if (pathSet.has(mount.path)) {
        throw new Error(`Invalid mounts: paths are not unique`);
      }
      pathSet.add(mount.path);
    }
  }

  private validateEnv(env: PrismaJson.EnvVar[]) {
    if (env?.some((it) => !it.name || it.name.length === 0)) {
      return {
        valid: false,
        message: "Some environment variable(s) are empty",
      };
    }

    if (env?.some((it) => it.name.startsWith("_PRIVATE_ANVILOPS_"))) {
      // Environment variables with this prefix are used in the log shipper - see log-shipper/main.go
      return {
        valid: false,
        message:
          'Environment variable(s) use reserved prefix "_PRIVATE_ANVILOPS_"',
      };
    }

    const envNames = new Set();

    for (let envVar of env) {
      if (envNames.has(envVar.name)) {
        return {
          valid: false,
          message: "Duplicate environment variable " + envVar.name,
        };
      }
      envNames.add(envVar.name);
    }
  }

  private async validateImageReference(reference: string) {
    try {
      // Look up the image in its registry to make sure it exists
      await getImageConfig(reference);
    } catch (e) {
      console.error(e);
      throw new Error("Image could not be found in its registry.");
    }
  }

  private async validateSubdomain(subdomain: string) {
    if (subdomain.length > MAX_SUBDOMAIN_LEN || !isRFC1123(subdomain)) {
      throw new Error(
        "Subdomain must contain only lowercase alphanumeric characters or '-', " +
          "start and end with an alphanumeric character, " +
          `and contain at most ${MAX_SUBDOMAIN_LEN} characters`,
      );
    }

    if (await this.appRepo.isSubdomainInUse(subdomain)) {
      throw new Error("Subdomain is in use");
    }
  }
}
