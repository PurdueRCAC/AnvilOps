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
      collectLogs: boolean;
      replicas: number;
      port: number;
      servicePort: number;
      mounts: { path: string; amountInMiB: number }[];
      extra: {
        postStart: string | null;
        preStop: string | null;
        limits: ResourceRequests;
        requests: ResourceRequests;
      };
    };
    type AppFlags = {
      enableCD: boolean;
      isPreviewing: boolean;
    };
  }
}
