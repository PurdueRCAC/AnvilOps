import { db } from "../../db/index.ts";
import { AppService } from "./app.ts";
import { DeploymentService } from "./deployment.ts";
import { DeploymentConfigService } from "./deploymentConfig.ts";

export const deploymentConfigService = new DeploymentConfigService(db.app);

export const appService = new AppService(deploymentConfigService);

export const deploymentService = new DeploymentService(
  db.app,
  db.appGroup,
  db.deployment,
);
