/*
  Warnings:

  - You are about to drop the column `deploymentConfigTemplateId` on the `App` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[configId]` on the table `App` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "App" DROP CONSTRAINT "App_deploymentConfigTemplateId_fkey";

-- DropIndex
DROP INDEX "App_deploymentConfigTemplateId_key";

-- AlterTable
ALTER TABLE "App" DROP COLUMN "deploymentConfigTemplateId",
ADD COLUMN     "configId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "App_configId_key" ON "App"("configId");

-- AddForeignKey
ALTER TABLE "App" ADD CONSTRAINT "App_configId_fkey" FOREIGN KEY ("configId") REFERENCES "DeploymentConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;
