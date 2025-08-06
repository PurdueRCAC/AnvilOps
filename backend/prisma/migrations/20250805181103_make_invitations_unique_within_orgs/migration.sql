/*
  Warnings:

  - A unique constraint covering the columns `[inviteeId,orgId]` on the table `Invitation` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Invitation_inviteeId_orgId_key" ON "Invitation"("inviteeId", "orgId");
