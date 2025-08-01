/*
  Warnings:

  - A unique constraint covering the columns `[clusterUsername]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "App" ADD COLUMN     "clusterUsername" TEXT;

-- AlterTable
ALTER TABLE "AppGroup" ADD COLUMN     "projectId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "clusterUsername" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_clusterUsername_key" ON "User"("clusterUsername");
