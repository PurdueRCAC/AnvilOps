type BaseResources = {
  cpu?: string;
  memory?: string;
};

declare namespace PrismaJson {
  type EnvVar = {
    name: string;
    value: string;
    isSensitive: boolean;
  };

  type Resources = BaseResources & {
    [resource: string]: string;
  };

  type VolumeMount = { path: string; amountInMiB: number };

  type HelmValues = Record<string, unknown>;
}
