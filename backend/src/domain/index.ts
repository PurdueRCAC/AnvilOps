import { db } from "../db/index.ts";
import { AppValidator } from "./app.ts";
import { DeploymentController } from "./deployment.ts";
import { DeploymentConfigValidator } from "./deploymentConfig.ts";

export const deploymentConfigValidator = new DeploymentConfigValidator(db.app);
export const appValidator = new AppValidator(deploymentConfigValidator);
export const deploymentController = new DeploymentController(
  deploymentConfigValidator,
);
