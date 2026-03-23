-- AlterEnum
ALTER TYPE "DeploymentSource" ADD VALUE 'HELM';

-- AlterTable
ALTER TABLE "HelmConfig" ADD COLUMN     "watchLabels" TEXT;
