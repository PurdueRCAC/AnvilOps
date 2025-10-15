-- CreateEnum
CREATE TYPE "LogStream" AS ENUM ('stdout', 'stderr');

-- AlterTable
ALTER TABLE "Log" ADD COLUMN     "stream" "LogStream" NOT NULL DEFAULT 'stdout';
