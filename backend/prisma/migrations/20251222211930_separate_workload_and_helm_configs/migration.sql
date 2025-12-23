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
    "helmConfigId" INTEGER,
    "workloadConfigId" INTEGER,

    CONSTRAINT "DeploymentConfig_pkey" PRIMARY KEY ("id")
);

-- Fill with existing WorkloadConfigs
INSERT INTO "DeploymentConfig" ("id", "appType", "workloadConfigId")
SELECT id, 'WORKLOAD', id FROM "WorkloadConfig";

-- Adjust sequence to start at highest existing id value
SELECT setval(
  '"DeploymentConfig_id_seq"',
  (SELECT COALESCE(MAX(id), 0) FROM "DeploymentConfig")
);

-- Rename indexes
ALTER TABLE "Deployment" DROP CONSTRAINT "Deployment_configId_fkey";
ALTER TABLE "Deployment" 
  ADD CONSTRAINT "Deployment_configId_fkey"
  FOREIGN KEY ("configId") REFERENCES "DeploymentConfig"(id)
  ON UPDATE CASCADE ON DELETE SET NULL;

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

    CONSTRAINT "HelmConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeploymentConfig_workloadConfigId_key" ON "DeploymentConfig"("workloadConfigId");

-- CreateIndex
CREATE UNIQUE INDEX "DeploymentConfig_helmConfigId_key" ON "DeploymentConfig"("helmConfigId");

-- AddForeignKey
ALTER TABLE "DeploymentConfig" ADD CONSTRAINT "DeploymentConfig_workloadConfigId_fkey" FOREIGN KEY ("workloadConfigId") REFERENCES "WorkloadConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeploymentConfig" ADD CONSTRAINT "DeploymentConfig_helmConfigId_fkey" FOREIGN KEY ("helmConfigId") REFERENCES "HelmConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
