import { db } from "../../db/index.ts";
import { AppService } from "./app.ts";
import { DeploymentService } from "./deployment.ts";
import { DeploymentConfigValidator } from "./deploymentConfig.ts";

export const deploymentConfigValidator = new DeploymentConfigValidator(db.app);
export const deploymentService = new DeploymentService(
  deploymentConfigValidator,
);

export const appService = new AppService(
  deploymentConfigValidator,
  deploymentService,
);
