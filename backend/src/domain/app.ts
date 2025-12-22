import { Organization, User } from "../db/models.ts";
import { components } from "../generated/openapi.ts";
import { namespaceInUse } from "../lib/cluster/kubernetes.ts";
import { canManageProject, isRancherManaged } from "../lib/cluster/rancher.ts";
import {
  MAX_GROUPNAME_LEN,
  MAX_NAMESPACE_LEN,
  MAX_STS_NAME_LEN,
} from "../lib/cluster/resources.ts";
import { isRFC1123 } from "../lib/validate.ts";
import { DeploymentConfigValidator } from "./deploymentConfig.ts";

interface NewApp {
  name: string;
  projectId?: string;
  createIngress: boolean;
  namespace: string;
  config: components["schemas"]["DeploymentConfig"];
}

export class AppValidationError extends Error {}

export class AppValidator {
  private configValidator: DeploymentConfigValidator;
  constructor(configValidator: DeploymentConfigValidator) {
    this.configValidator = configValidator;
  }

  async validateApps(
    organization: Organization,
    user: User,
    ...apps: NewApp[]
  ) {
    const appValidationErrors = (
      await Promise.all(apps.map((app) => this.validateNewApp(app, user)))
    ).filter(Boolean);
    if (appValidationErrors.length != 0) {
      throw new AppValidationError(JSON.stringify(appValidationErrors));
    }

    if (
      apps.some(
        (app) =>
          app.config.source === "git" && !organization.githubInstallationId,
      )
    ) {
      throw new AppValidationError(
        "The AnvilOps GitHub App is not installed in this organization.",
      );
    }
  }

  private async validateNewApp(app: NewApp, user: { clusterUsername: string }) {
    if (isRancherManaged()) {
      if (!app.projectId) {
        throw new AppValidationError("Project ID is required");
      }

      if (!(await canManageProject(user.clusterUsername, app.projectId))) {
        throw new AppValidationError("Project not found");
      }
    }

    if (app.config.appType === "workload") {
      await this.configValidator.validateCommonWorkloadConfig(app.config);
    }

    if (
      !(
        0 < app.namespace.length && app.namespace.length <= MAX_NAMESPACE_LEN
      ) ||
      !isRFC1123(app.namespace)
    ) {
      throw new AppValidationError(
        "Namespace must contain only lowercase alphanumeric characters or '-', " +
          "start with an alphabetic character and end with an alphanumeric character, " +
          `and contain at most ${MAX_NAMESPACE_LEN} characters`,
      );
    }

    if (await namespaceInUse(app.namespace)) {
      throw new AppValidationError("Namespace is in use");
    }
    this.validateAppName(app.name);
  }

  validateAppGroupName(name: string) {
    if (
      !(0 < name.length && name.length <= MAX_GROUPNAME_LEN) ||
      !isRFC1123(name)
    ) {
      throw new AppValidationError("Invalid app group name");
    }
  }

  private validateAppName(name: string) {
    if (name.length > MAX_STS_NAME_LEN || !isRFC1123(name)) {
      throw new AppValidationError(
        "App name must contain only lowercase alphanumeric characters or '-', " +
          "start and end with an alphanumeric character, " +
          `and contain at most ${MAX_STS_NAME_LEN} characters`,
      );
    }
  }
}
