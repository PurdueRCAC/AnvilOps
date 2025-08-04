/*
  Warnings:

  - You are about to drop the column `githubOAuthState` on the `User` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "GitHubOAuthAction" AS ENUM ('CREATE_INSTALLATION', 'GET_UID_FOR_LATER_INSTALLATION', 'VERIFY_INSTALLATION_ACCESS');

-- AlterTable
ALTER TABLE "User" DROP COLUMN "githubOAuthState",
ADD COLUMN     "githubUserId" INTEGER;

-- CreateTable
CREATE TABLE "GitHubOAuthState" (
    "id" SERIAL NOT NULL,
    "random" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "orgId" INTEGER NOT NULL,
    "action" "GitHubOAuthAction" NOT NULL,

    CONSTRAINT "GitHubOAuthState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnassignedInstallation" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "installationId" INTEGER NOT NULL,
    "targetName" TEXT NOT NULL,
    "url" TEXT NOT NULL,

    CONSTRAINT "UnassignedInstallation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GitHubOAuthState_random_key" ON "GitHubOAuthState"("random");

-- CreateIndex
CREATE UNIQUE INDEX "GitHubOAuthState_userId_key" ON "GitHubOAuthState"("userId");

-- AddForeignKey
ALTER TABLE "GitHubOAuthState" ADD CONSTRAINT "GitHubOAuthState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnassignedInstallation" ADD CONSTRAINT "UnassignedInstallation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
