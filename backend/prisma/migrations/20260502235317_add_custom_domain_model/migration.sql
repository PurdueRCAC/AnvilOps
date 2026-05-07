-- CreateEnum
CREATE TYPE "DomainVerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'GENERATING', 'GENERATED', 'ERROR');

-- CreateTable
CREATE TABLE "Domain" (
    "id" SERIAL NOT NULL,
    "appId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "status" "DomainVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "certIssuedAt" TIMESTAMP(3),
    "certExpiresAt" TIMESTAMP(3),
    "verificationToken" TEXT NOT NULL,
    "orderURL" TEXT,
    "token" TEXT,
    "keyAuthorization" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Domain_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Domain_token_key" ON "Domain"("token");

-- AddForeignKey
ALTER TABLE "Domain" ADD CONSTRAINT "Domain_appId_fkey" FOREIGN KEY ("appId") REFERENCES "App"("id") ON DELETE CASCADE ON UPDATE CASCADE;
