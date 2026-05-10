/*
  Warnings:

  - A unique constraint covering the columns `[orgId,name]` on the table `AppGroup` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "AppGroup_orgId_name_key" ON "AppGroup"("orgId", "name");
