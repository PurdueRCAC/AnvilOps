-- CreateEnum
CREATE TYPE "PermissionLevel" AS ENUM ('OWNER', 'USER');

-- CreateEnum
CREATE TYPE "ImageBuilder" AS ENUM ('dockerfile', 'railpack');

-- CreateEnum
CREATE TYPE "DeploymentSource" AS ENUM ('GIT', 'IMAGE');

-- CreateEnum
CREATE TYPE "WebhookEvent" AS ENUM ('push', 'workflow_run');

-- CreateEnum
CREATE TYPE "LogType" AS ENUM ('SYSTEM', 'BUILD', 'RUNTIME');

-- CreateEnum
CREATE TYPE "DeploymentStatus" AS ENUM ('QUEUED', 'PENDING', 'BUILDING', 'DEPLOYING', 'COMPLETE', 'ERROR', 'STOPPED');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "ciLogonUserId" TEXT,
    "githubOAuthState" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationMembership" (
    "userId" INTEGER NOT NULL,
    "organizationId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "permissionLevel" "PermissionLevel" NOT NULL,

    CONSTRAINT "OrganizationMembership_pkey" PRIMARY KEY ("userId","organizationId")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "githubInstallationId" INTEGER,
    "newInstallationId" INTEGER,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "App" (
    "id" SERIAL NOT NULL,
    "orgId" INTEGER NOT NULL,
    "appGroupId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "subdomain" TEXT NOT NULL,
    "imageRepo" TEXT NOT NULL DEFAULT '',
    "logIngestSecret" TEXT NOT NULL,
    "deploymentConfigTemplateId" INTEGER NOT NULL,

    CONSTRAINT "App_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppGroup" (
    "id" SERIAL NOT NULL,
    "orgId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "isMono" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AppGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deployment" (
    "id" SERIAL NOT NULL,
    "appId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "commitHash" TEXT,
    "commitMessage" TEXT,
    "builderJobId" TEXT,
    "checkRunId" INTEGER,
    "workflowRunId" INTEGER,
    "status" "DeploymentStatus" NOT NULL DEFAULT 'PENDING',
    "secret" TEXT,
    "configId" INTEGER NOT NULL,

    CONSTRAINT "Deployment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeploymentConfig" (
    "id" SERIAL NOT NULL,
    "env" JSONB NOT NULL DEFAULT '[]',
    "envKey" TEXT NOT NULL DEFAULT '',
    "source" "DeploymentSource" NOT NULL,
    "repositoryId" INTEGER,
    "branch" TEXT DEFAULT 'main',
    "event" "WebhookEvent",
    "eventId" INTEGER,
    "builder" "ImageBuilder",
    "rootDir" TEXT,
    "dockerfilePath" TEXT,
    "imageTag" TEXT,
    "fieldValues" JSONB NOT NULL,

    CONSTRAINT "DeploymentConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Log" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" "LogType" NOT NULL,
    "deploymentId" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "index" INTEGER NOT NULL DEFAULT 0,
    "content" JSONB NOT NULL,
    "podName" TEXT,

    CONSTRAINT "Log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepoImportState" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "srcRepoURL" TEXT NOT NULL,
    "destIsOrg" BOOLEAN NOT NULL,
    "destRepoOwner" TEXT NOT NULL,
    "destRepoName" TEXT NOT NULL,
    "makePrivate" BOOLEAN NOT NULL,
    "userId" INTEGER NOT NULL,
    "orgId" INTEGER NOT NULL,

    CONSTRAINT "RepoImportState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cache" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cache_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "session" (
    "sid" VARCHAR NOT NULL,
    "sess" JSON NOT NULL,
    "expire" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_ciLogonUserId_key" ON "User"("ciLogonUserId");

-- CreateIndex
CREATE UNIQUE INDEX "App_subdomain_key" ON "App"("subdomain");

-- CreateIndex
CREATE UNIQUE INDEX "App_logIngestSecret_key" ON "App"("logIngestSecret");

-- CreateIndex
CREATE UNIQUE INDEX "App_deploymentConfigTemplateId_key" ON "App"("deploymentConfigTemplateId");

-- CreateIndex
CREATE UNIQUE INDEX "Deployment_workflowRunId_key" ON "Deployment"("workflowRunId");

-- CreateIndex
CREATE UNIQUE INDEX "Deployment_secret_key" ON "Deployment"("secret");

-- CreateIndex
CREATE UNIQUE INDEX "Deployment_configId_key" ON "Deployment"("configId");

-- CreateIndex
CREATE INDEX "IDX_session_expire" ON "session"("expire");

-- AddForeignKey
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "App" ADD CONSTRAINT "App_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "App" ADD CONSTRAINT "App_appGroupId_fkey" FOREIGN KEY ("appGroupId") REFERENCES "AppGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "App" ADD CONSTRAINT "App_deploymentConfigTemplateId_fkey" FOREIGN KEY ("deploymentConfigTemplateId") REFERENCES "DeploymentConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppGroup" ADD CONSTRAINT "AppGroup_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_configId_fkey" FOREIGN KEY ("configId") REFERENCES "DeploymentConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Log" ADD CONSTRAINT "Log_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "Deployment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepoImportState" ADD CONSTRAINT "RepoImportState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepoImportState" ADD CONSTRAINT "RepoImportState_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

