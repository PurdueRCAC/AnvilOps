import type {
  DeploymentSource,
  DeploymentStatus,
  HelmUrlType,
  ImageBuilder,
  PermissionLevel,
  WebhookEvent,
} from "../generated/prisma/enums.ts";

export interface Organization {
  id: number;
  name: string;
  githubInstallationId: number;
  newInstallationId?: number;
}

export interface User {
  id: number;
  email: string | null;
  name: string | null;
  clusterUsername: string;
  ciLogonUserId: string | null;
  githubUserId: number | null;
}

export interface UnassignedInstallation {
  id: number;
  userId: number;
  installationId: number;
  targetName: string;
  url: string;
}

export interface Invitation {
  inviter: {
    name: string;
  };
  invitee: {
    name: string;
  };
  org: {
    name: string;
  };
  id: number;
  createdAt: Date;
  inviterId: number;
  inviteeId: number;
  orgId: number;
}

export interface OrgMembership {
  userId: number;
  organization: Organization;
  user: User;
  permissionLevel: PermissionLevel;
}

export interface AppGroup {
  isMono: boolean;
  id: number;
  name: string;
}

export interface App {
  id: number;
  orgId: number;
  name: string;
  displayName: string;
  namespace: string;
  projectId: string;
  imageRepo: string;
  appGroupId: number;
  logIngestSecret: string;
  configId: number | null;
  clusterUsername: string;
  createdAt: Date;
  updatedAt: Date;
  enableCD: boolean;
}

export interface Deployment {
  id: number;
  workflowRunId: number | null;
  configId: number;
  appId: number;
  createdAt: Date;
  updatedAt: Date;
  commitMessage: string | null;
  checkRunId: number | null;
  status: DeploymentStatus;
  secret: string;
}

export interface DeploymentWithSourceInfo extends Omit<Deployment, "secret"> {
  imageTag?: string;
  commitHash?: string;
  repositoryId?: number;
  source?: DeploymentSource;
}

export interface WorkloadConfig {
  id: number;
  displayEnv: PrismaJson.EnvVar[];
  getEnv(): PrismaJson.EnvVar[];
  appType: "workload";
  source: DeploymentSource;
  repositoryId?: number;
  branch?: string;
  event?: WebhookEvent;
  eventId?: number;
  commitHash?: string;
  builder?: ImageBuilder;
  rootDir?: string;
  dockerfilePath?: string;
  imageTag?: string;
  collectLogs: boolean;
  createIngress: boolean;
  subdomain?: string;
  requests: PrismaJson.Resources;
  limits: PrismaJson.Resources;
  replicas: number;
  port: number;
  mounts: PrismaJson.VolumeMount[];
}

export type WorkloadConfigCreate = Omit<
  WorkloadConfig,
  "id" | "displayEnv" | "getEnv"
> & {
  env: PrismaJson.EnvVar[];
};

export type GitConfig = WorkloadConfig & {
  source: "GIT";
  repositoryId: number;
  branch: string;
  event: WebhookEvent;
  eventId?: number;
  commitHash: string;
  builder: ImageBuilder;
  rootDir?: string;
  dockerfilePath?: string;
};

export type GitConfigCreate = WorkloadConfigCreate & {
  source: "GIT";
  repositoryId: number;
  branch: string;
  event: WebhookEvent;
  eventId?: number;
  commitHash: string;
  builder: ImageBuilder;
  rootDir?: string;
  dockerfilePath?: string;
};

export type HelmConfig = {
  id: number;
  appType: "helm";
  source: "HELM";
  url: string;
  version: string;
  urlType: HelmUrlType;
  values?: any;
};

export type HelmConfigCreate = Omit<HelmConfig, "id">;

export interface Log {
  id: number;
  type: "BUILD" | "RUNTIME";
  deploymentId: number;
  timestamp: Date;
  content: string;
  podName: string;
  stream: "stdout" | "stderr";
}

export interface AppCreate {
  orgId: number;
  appGroupId: number;
  name: string;
  namespace: string;
  clusterUsername: string;
  projectId: string;
}

export interface RepoImportState {
  id: string;
  srcRepoURL: string;
  destIsOrg: boolean;
  destRepoOwner: string;
  destRepoName: string;
  makePrivate: boolean;
  userId: number;
  orgId: number;
}
