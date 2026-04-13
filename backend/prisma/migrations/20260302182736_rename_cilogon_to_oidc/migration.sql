-- AlterIndex
ALTER INDEX "User_ciLogonUserId_key"
RENAME TO "User_oidcUserId_key";

-- AlterTable
ALTER TABLE "User" 
RENAME COLUMN "ciLogonUserId" TO "oidcUserId";
