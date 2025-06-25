declare global {
  namespace PrismaJson {
    type EnvVar = {
      name: string;
      value: string;
      isSensitive: boolean;
    };
  }
}

export {};
