import type { components } from "@/generated/openapi";

export type GroupFormFields = {
  orgId?: number;
  groupOption: components["schemas"]["NewApp"]["appGroup"];
};

export type GitFormFields = {
  dockerfilePath: string;
  rootDir: string;
  repositoryId?: number;
  repoName: string;
  event: "push" | "workflow_run";
  eventId?: number | null;
  branch?: string;
  builder: "dockerfile" | "railpack";
};

export type ImageFormFields = {
  imageTag: string;
};

export type WorkloadFormFields = {
  port?: string;
  replicas?: string;
  env: components["schemas"]["Envs"];
  mounts: components["schemas"]["Mount"][];
  subdomain?: string | null;
  createIngress: boolean;
  collectLogs: boolean;
  cpuCores: string;
  memoryInMiB: string;
  namespace?: string;

  git: GitFormFields;
  image: ImageFormFields;
};

export type WorkloadUpdate =
  | Partial<Omit<WorkloadFormFields, "git" | "image">>
  | ((
      prev: WorkloadFormFields,
    ) => Partial<Omit<WorkloadFormFields, "git" | "image">>);

export type HelmFormFields = Partial<
  Omit<components["schemas"]["HelmConfigOptions"], "source" | "appType">
>;

export type CommonFormFields = {
  displayName?: string;
  projectId: string | null;
  appType: "workload" | "helm";
  source: "git" | "image" | "helm";
  workload: WorkloadFormFields;
  helm: HelmFormFields;
};
