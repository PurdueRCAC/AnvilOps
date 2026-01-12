-- CreateEnum
CREATE TYPE "AppType" AS ENUM ('workload', 'helm');

-- CreateEnum
CREATE TYPE "HelmUrlType" AS ENUM ('oci', 'absolute');

-- AlterTable
ALTER TABLE "DeploymentConfig"
RENAME TO "WorkloadConfig";

ALTER INDEX "DeploymentConfig_pkey" RENAME TO "WorkloadConfig_pkey";

ALTER SEQUENCE "DeploymentConfig_id_seq"
RENAME TO "WorkloadConfig_id_seq";

CREATE TABLE "DeploymentConfig" (
    "id" SERIAL NOT NULL,
    "appType" "AppType" NOT NULL,

    CONSTRAINT "DeploymentConfig_pkey" PRIMARY KEY ("id")
);

-- Fill with existing WorkloadConfigs
INSERT INTO "DeploymentConfig" ("id", "appType")
SELECT id, 'workload' FROM "WorkloadConfig";

-- Adjust sequence to start at highest existing id value
SELECT setval(
  '"DeploymentConfig_id_seq"',
  (SELECT COALESCE(MAX(id), 1) FROM "DeploymentConfig")
);

-- Add deploymentConfigId to WorkloadConfig
ALTER TABLE "WorkloadConfig"
ADD COLUMN "deploymentConfigId" INTEGER;

UPDATE "WorkloadConfig"
SET "deploymentConfigId" = id;

ALTER TABLE "WorkloadConfig"
ALTER COLUMN "deploymentConfigId" SET NOT NULL;

CREATE UNIQUE INDEX "WorkloadConfig_deploymentConfigId_key" ON "WorkloadConfig"("deploymentConfigId");

ALTER TABLE "WorkloadConfig"
  ADD CONSTRAINT "WorkloadConfig_deploymentConfigId_fkey"
  FOREIGN KEY ("deploymentConfigId") REFERENCES "DeploymentConfig"(id)
  ON UPDATE CASCADE ON DELETE CASCADE;

-- Alter foreign key constraints
ALTER TABLE "Deployment" DROP CONSTRAINT "Deployment_configId_fkey";
ALTER TABLE "Deployment" 
  ADD CONSTRAINT "Deployment_configId_fkey"
  FOREIGN KEY ("configId") REFERENCES "DeploymentConfig"(id)
  ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "App" DROP CONSTRAINT "App_configId_fkey";
ALTER TABLE "App"
  ADD CONSTRAINT "App_configId_fkey"
  FOREIGN KEY ("configId") references "DeploymentConfig"(id)
  ON UPDATE CASCADE ON DELETE SET NULL;

-- CreateTable
CREATE TABLE "HelmConfig" (
    "id" SERIAL NOT NULL,
    "url" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "urlType" "HelmUrlType" NOT NULL,
    "values" JSONB,
    "deploymentConfigId" INTEGER UNIQUE NOT NULL,
    CONSTRAINT "HelmConfig_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "HelmConfig_deploymentConfigId_fkey"
    FOREIGN KEY ("deploymentConfigId") REFERENCES "DeploymentConfig"(id)
    ON UPDATE CASCADE ON DELETE CASCADE
);