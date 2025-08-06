import { Prisma } from "../src/generated/prisma/client.ts";
import { db } from "../src/lib/db.ts";

const Resources = ["cpu", "memory", "nvidia.com/gpu"] as const;
declare global {
  namespace PrismaJson {
    type EnvVar = {
      name: string;
      value: string;
      isSensitive: boolean;
    };

    type ResourceRequests = Record<
      (typeof Resources)[number],
      string | undefined
    >;
    type ConfigFields = {
      replicas: number;
      port: number;
      servicePort: number;
      mounts: { path: string; amountInMiB: number }[];
      extra: {
        postStart?: string;
        preStop?: string;
        limits: ResourceRequests;
        requests: ResourceRequests;
      };
    };
    type AppFlags = {
      enableCD: boolean;
      isPreviewing: boolean;
    };
  }
  type ExtendedDeploymentConfig = Prisma.Result<
    typeof db.deploymentConfig,
    {},
    "findFirst"
  >;
}

export {};
