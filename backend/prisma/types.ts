import { Prisma } from "../src/generated/prisma/client.ts";
import { db } from "../src/lib/db.ts";

const Resources = ["cpu", "memory", "nvidia.com/gpu"] as const;
declare global {
  namespace DeploymentJson {
    type EnvVar = {
      name: string;
      value: string;
      isSensitive: boolean;
    };

    type ConfigFields = {
      replicas: number;
      port: number;
      servicePort: number;
      mounts: { path: string; amountInMiB: number }[];
      extra: {
        postStart?: string;
        preStop?: string;
        limits?: Record<(typeof Resources)[number], string>;
        requests?: Record<(typeof Resources)[number], string>;
      };
    };
  }
  type ExtendedDeploymentConfig = Prisma.Result<
    typeof db.deploymentConfig,
    {},
    "findFirst"
  >;
}

export {};
