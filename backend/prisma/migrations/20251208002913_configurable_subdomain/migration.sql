-- AlterIndex
ALTER INDEX "App_subdomain_key" RENAME TO "App_namespace_key";

-- AlterTable
ALTER TABLE "App" 
RENAME COLUMN "subdomain" TO "namespace";

-- AlterTable
ALTER TABLE "DeploymentConfig" ADD COLUMN     "subdomain" TEXT;