import { db } from "../db/index.ts";
import { AppValidator } from "./app.ts";
import { DeploymentService } from "./deployment.ts";
import { DeploymentConfigValidator } from "./deploymentConfig.ts";

export const deploymentConfigValidator = new DeploymentConfigValidator(db.app);
export const appValidator = new AppValidator(deploymentConfigValidator);
export const deploymentService = new DeploymentService(
  deploymentConfigValidator,
);
