/*
  Warnings:

  - The values [STOPPED] on the enum `DeploymentStatus` will be removed. If these variants are still used in the database, this will fail.
  - The values [SYSTEM] on the enum `LogType` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `builderJobId` on the `Deployment` table. All the data in the column will be lost.

*/

-- Set deployments with a status of STOPPED to COMPLETE
UPDATE "Deployment" SET "status" = 'COMPLETE' WHERE "status" = 'STOPPED';

-- AlterEnum
BEGIN;
CREATE TYPE "DeploymentStatus_new" AS ENUM ('QUEUED', 'PENDING', 'BUILDING', 'DEPLOYING', 'COMPLETE', 'ERROR', 'CANCELLED');
ALTER TABLE "Deployment" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Deployment" ALTER COLUMN "status" TYPE "DeploymentStatus_new" USING ("status"::text::"DeploymentStatus_new");
ALTER TYPE "DeploymentStatus" RENAME TO "DeploymentStatus_old";
ALTER TYPE "DeploymentStatus_new" RENAME TO "DeploymentStatus";
DROP TYPE "DeploymentStatus_old";
ALTER TABLE "Deployment" ALTER COLUMN "status" SET DEFAULT 'QUEUED';
COMMIT;

-- Set logs with a status of SYSTEM to BUILD
UPDATE "Log" SET "type" = 'BUILD' WHERE "type" = 'SYSTEM';

-- AlterEnum
BEGIN;
CREATE TYPE "LogType_new" AS ENUM ('BUILD', 'RUNTIME');
ALTER TABLE "Log" ALTER COLUMN "type" TYPE "LogType_new" USING ("type"::text::"LogType_new");
ALTER TYPE "LogType" RENAME TO "LogType_old";
ALTER TYPE "LogType_new" RENAME TO "LogType";
DROP TYPE "LogType_old";
COMMIT;

-- AlterTable
ALTER TABLE "Deployment" DROP COLUMN "builderJobId",
ALTER COLUMN "status" SET DEFAULT 'QUEUED';
