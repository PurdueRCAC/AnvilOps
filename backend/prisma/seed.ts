import { PrismaClient } from "../src/generated/prisma/client.ts";

const prisma = new PrismaClient();
async function main() {
  await prisma.user.upsert({
    where: { id: 1 },
    update: {},
    create: {
      email: "email@example.com",
      name: "Example User",
    },
  });
  await prisma.organization.upsert({
    where: { id: 1 },
    update: {},
    create: {
      name: "Example Org",
    },
  });

  await prisma.organizationMembership.upsert({
    where: { userId_organizationId: { userId: 1, organizationId: 1 } },
    update: {},
    create: {
      user: { connect: { id: 1 } },
      organization: { connect: { id: 1 } },
      permissionLevel: "OWNER",
    },
  });

  await prisma.app.upsert({
    where: { id: 1 },
    update: {},
    create: {
      orgId: 1,
      name: "App 1",
      repositoryURL: "https://github.com/octocat/repository1",
      webhookSecret: "secret1",
      dockerfilePath: "./Dockerfile",
      port: 80,
    },
  });
  await prisma.app.upsert({
    where: { id: 2 },
    update: {},
    create: {
      orgId: 1,
      name: "App 2",
      repositoryURL: "https://github.com/octocat/repository3",
      webhookSecret: "secret2",
      dockerfilePath: "./Dockerfile",
      port: 80,
    },
  });

  await prisma.app.upsert({
    where: { id: 3 },
    update: {},
    create: {
      orgId: 1,
      name: "App 3",
      repositoryURL: "https://github.com/octocat/repository3",
      webhookSecret: "secret1",
      dockerfilePath: "",
      port: 3001,
    },
  });

  await prisma.app.upsert({
    where: { id: 4 },
    update: {},
    create: {
      orgId: 1,
      name: "App 4",
      repositoryURL: "https://github.com/octocat/repository4",
      webhookSecret: "secret4",
      dockerfilePath: "",
      port: 3000,
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
