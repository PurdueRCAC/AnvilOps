/*
  Warnings:

  - You are about to drop the column `projectId` on the `AppGroup` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "App" ADD COLUMN     "projectId" TEXT;

-- AlterTable
ALTER TABLE "AppGroup" DROP COLUMN "projectId";
