import type { Organization, User } from "../../db/models.ts";
import type { components } from "../../generated/openapi.ts";
import {
  canManageProject,
  isRancherManaged,
} from "../../lib/cluster/rancher.ts";
import {
  MAX_GROUPNAME_LEN,
  MAX_NAMESPACE_LEN,
  MAX_STS_NAME_LEN,
} from "../../lib/cluster/resources.ts";
import { env } from "../../lib/env.ts";
import { isRFC1123 } from "../../lib/validate.ts";
import { ValidationError } from "../../service/common/errors.ts";
import { isNamespaceAvailable } from "../isNamespaceAvailable.ts";
import { DeploymentConfigService } from "./deploymentConfig.ts";
interface CreateAppInput {
  type: "create";
  name: string;
  namespace: string;
  projectId?: string;
  config: components["schemas"]["DeploymentConfig"];
}

interface UpdateAppInput {
  type: "update";
  existingAppId: number;
  projectId?: string;
  config: components["schemas"]["DeploymentConfig"];
}

export type AppInput = CreateAppInput | UpdateAppInput;

export class AppService {
  private configService: DeploymentConfigService;
  constructor(configService: DeploymentConfigService) {
    this.configService = configService;
  }

  /**
   * Validates and prepares deployment config and commit message for app creation or update.
   * @throws ValidationError, OrgNotFoundError
   */
  async prepareMetadataForApps(
    organization: Organization,
    user: User,
    ...apps: AppInput[]
  ) {
    const appValidationErrors = (
      await Promise.all(
        apps.map(async (app) => {
          try {
            await this.validateApp(app, user);
            return null;
          } catch (e) {
            return e.message;
          }
        }),
      )
    ).filter(Boolean);
    if (appValidationErrors.length != 0) {
      throw new ValidationError(appValidationErrors.join(","));
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

    const metadata = await Promise.allSettled(
      apps.map(
        async (app) =>
          await this.configService.prepareDeploymentMetadata(
            app.config,
            organization,
          ),
      ),
    );

    const errors = metadata.filter((res) => res.status === "rejected");
    if (errors.length > 0) {
      throw new ValidationError(
        errors.map((err) => (err.reason as Error)?.message).join(","),
      );
    }

    type MetadataReturn = Awaited<
      ReturnType<typeof this.configService.prepareDeploymentMetadata>
    >;

    return metadata.map(
      (app) => (app as PromiseFulfilledResult<MetadataReturn>).value,
    );
  }

  /**
   * Validates an app input for create or update.
   * @throws ValidationError
   */
  private async validateApp(app: AppInput, user: { clusterUsername: string }) {
    // Common validation for both create and update
    await this.validateCommon(app, user);

    // Type-specific validation
    if (app.type === "create") {
      await this.validateCreate(app);
    }
  }

  /**
   * Validation steps common between app creates and updates.
   * @throws ValidationError
   */
  private async validateCommon(
    app: AppInput,
    user: { clusterUsername: string },
  ) {
    if (isRancherManaged()) {
      if (!app.projectId) {
        throw new ValidationError("Project ID is required");
      }

      if (!(await canManageProject(user.clusterUsername, app.projectId))) {
        throw new ValidationError("Project not found");
      }
    }

    if (app.config.appType === "workload") {
      await this.configService.validateCommonWorkloadConfig(
        app.config,
        app.type === "update" ? app.existingAppId : undefined,
      );
    } else if (app.config.appType === "helm") {
      if (!env.ALLOW_HELM_DEPLOYMENTS) {
        throw new ValidationError("Helm deployments are disabled");
      }
    }
  }

  /**
   * Validation steps specific to app creation.
   * @throws ValidationError
   */
  private async validateCreate(app: CreateAppInput) {
    if (
      app.namespace.length == 0 ||
      app.namespace.length > MAX_NAMESPACE_LEN ||
      !isRFC1123(app.namespace)
    ) {
      throw new ValidationError(
        "Namespace must contain only lowercase alphanumeric characters or '-', " +
          "start with an alphabetic character and end with an alphanumeric character, " +
          `and contain at most ${MAX_NAMESPACE_LEN} characters`,
      );
    }

    if (!(await isNamespaceAvailable(app.namespace))) {
      throw new ValidationError("namespace is unavailable");
    }

    this.validateAppName(app.name);
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
