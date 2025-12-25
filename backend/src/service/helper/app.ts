import { Organization, User } from "../../db/models.ts";
import { components } from "../../generated/openapi.ts";
import { namespaceInUse } from "../../lib/cluster/kubernetes.ts";
import {
  canManageProject,
  isRancherManaged,
} from "../../lib/cluster/rancher.ts";
import {
  MAX_GROUPNAME_LEN,
  MAX_NAMESPACE_LEN,
  MAX_STS_NAME_LEN,
} from "../../lib/cluster/resources.ts";
import { isRFC1123 } from "../../lib/validate.ts";
import { ValidationError } from "../../service/common/errors.ts";
import { DeploymentService } from "./deployment.ts";
import { DeploymentConfigValidator } from "./deploymentConfig.ts";

export interface App {
  name?: string;
  projectId?: string;
  namespace?: string;
  config: components["schemas"]["DeploymentConfig"];
}

export class AppService {
  private configValidator: DeploymentConfigValidator;
  private deploymentService: DeploymentService;
  constructor(
    configValidator: DeploymentConfigValidator,
    deploymentService: DeploymentService,
  ) {
    this.configValidator = configValidator;
    this.deploymentService = deploymentService;
  }

  /**
   * @throws ValidationError, OrgNotFoundError
   */
  async prepareMetadataForApps(
    organization: Organization,
    user: User,
    ...apps: App[]
  ) {
    const appValidationErrors = (
      await Promise.all(
        apps.map(async (app) => {
          try {
            await this.validateNewApp(app, user);
            return null;
          } catch (e) {
            return e.message;
          }
        }),
      )
    ).filter(Boolean);
    if (appValidationErrors.length != 0) {
      throw new ValidationError(JSON.stringify(appValidationErrors));
    }

    if (
      apps.some(
        (app) =>
          app.config.source === "git" && !organization.githubInstallationId,
      )
    ) {
      throw new ValidationError(
        "The AnvilOps GitHub App is not installed in this organization.",
      );
    }

    const metadata: (
      | Awaited<
          ReturnType<typeof this.deploymentService.prepareDeploymentMetadata>
        >
      | Error
    )[] = await Promise.all(
      apps.map((app) => {
        try {
          return this.deploymentService.prepareDeploymentMetadata(
            app.config,
            organization.id,
          );
        } catch (e) {
          return e;
        }
      }),
    );

    const errors = metadata.filter((res) => res instanceof ValidationError);
    if (errors.length > 0) {
      throw new ValidationError(errors.map((err) => err.message).join(","));
    }

    return metadata as Awaited<
      ReturnType<typeof this.deploymentService.prepareDeploymentMetadata>
    >[];
  }

  /**
   * @throws ValidationError
   */
  private async validateNewApp(app: App, user: { clusterUsername: string }) {
    if (isRancherManaged()) {
      if (!app.projectId) {
        throw new ValidationError("Project ID is required");
      }

      if (!(await canManageProject(user.clusterUsername, app.projectId))) {
        throw new ValidationError("Project not found");
      }
    }

    if (app.config.appType === "workload") {
      await this.configValidator.validateCommonWorkloadConfig(app.config);
    }

    if (app.namespace) {
      if (
        !(
          0 < app.namespace.length && app.namespace.length <= MAX_NAMESPACE_LEN
        ) ||
        !isRFC1123(app.namespace)
      ) {
        throw new ValidationError(
          "Namespace must contain only lowercase alphanumeric characters or '-', " +
            "start with an alphabetic character and end with an alphanumeric character, " +
            `and contain at most ${MAX_NAMESPACE_LEN} characters`,
        );
      }

      if (await namespaceInUse(app.namespace)) {
        throw new ValidationError("namespace is unavailable");
      }
    }
    if (app.name) {
      this.validateAppName(app.name);
    }
  }

  /**
   * @throws ValidationError
   */
  validateAppGroupName(name: string) {
    if (
      !(0 < name.length && name.length <= MAX_GROUPNAME_LEN) ||
      !isRFC1123(name)
    ) {
      throw new ValidationError(
        "App group name must contain only lowercase alphanumeric characters or '-', " +
          "start with an alphabetic character and end with an alphanumeric character, " +
          `and contain at most ${MAX_GROUPNAME_LEN} characters`,
      );
    }
  }

  /**
   * @throws ValidationError
   */
  private validateAppName(name: string) {
    if (name.length > MAX_STS_NAME_LEN || !isRFC1123(name)) {
      throw new ValidationError(
        "App name must contain only lowercase alphanumeric characters or '-', " +
          "start and end with an alphanumeric character, " +
          `and contain at most ${MAX_STS_NAME_LEN} characters`,
      );
    }
  }
}
