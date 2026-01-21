import type { components } from "@/generated/openapi";
import type { App } from "@/pages/app/AppView";
import type {
  CommonFormFields,
  GitFormFields,
  GroupFormFields,
  HelmFormFields,
  ImageFormFields,
  WorkloadFormFields,
  WorkloadUpdate,
} from "./form.types";

export const MAX_SUBDOMAIN_LENGTH = 54;

const createDefaultGitState = (
  git?: Partial<GitFormFields>,
): GitFormFields => ({
  builder: "railpack",
  dockerfilePath: "./Dockerfile",
  rootDir: "./",
  event: "push",
  repoName: "",
  ...(git ?? {}),
});

const getDefaultImageState = () => ({ imageTag: "" });
const createDefaultWorkloadState = (
  git?: Partial<GitFormFields>,
): WorkloadFormFields => ({
  port: "",
  replicas: "1",
  env: [],
  mounts: [],
  subdomain: "",
  createIngress: true,
  collectLogs: true,
  cpuCores: "1",
  memoryInMiB: "1024",
  git: createDefaultGitState(git),
  image: getDefaultImageState(),
});

export const createDefaultCommonFormFields = (
  git?: Partial<GitFormFields>,
): CommonFormFields => ({
  appType: "workload",
  source: "git",
  projectId: null,
  workload: createDefaultWorkloadState(git),
  helm: {
    urlType: "oci",
  },
});

export const createDeploymentConfig = (
  formFields: Required<CommonFormFields>,
): components["schemas"]["DeploymentConfig"] => {
  if (formFields.appType === "workload") {
    const workloadConfig = formFields.workload as Required<WorkloadFormFields>;
    const cpu = Math.round(parseFloat(workloadConfig.cpuCores) * 1000) + "m";
    const memory = workloadConfig.memoryInMiB + "Mi";

    const workloadOptions: components["schemas"]["KnownDeploymentOptions"] = {
      appType: "workload",
      port: parseInt(workloadConfig.port),
      replicas: parseInt(workloadConfig.replicas),
      env: workloadConfig.env.filter((env) => env.name.length > 0),
      mounts: workloadConfig.mounts.filter((mount) => mount.path.length > 0),
      createIngress: workloadConfig.createIngress,
      subdomain: workloadConfig.createIngress ? workloadConfig.subdomain : null,
      collectLogs: workloadConfig.collectLogs,
      limits: { cpu, memory },
      requests: { cpu, memory },
    };
    switch (formFields.source) {
      case "git":
        return {
          ...workloadOptions,
          ...createGitDeploymentOptions(
            workloadConfig.git as Required<GitFormFields>,
          ),
        };

      case "image":
        return {
          ...workloadOptions,
          ...createImageDeploymentOptions(
            workloadConfig.image as Required<ImageFormFields>,
          ),
        };
    }
  } else {
    const helmConfig = formFields.helm as Required<HelmFormFields>;
    return {
      ...helmConfig,
      source: "helm",
      appType: "helm",
    };
  }

  throw new Error("Invalid app type");
};

const generateNamespace = (appState: Required<CommonFormFields>): string => {
  if (appState.appType === "workload") {
    return appState.workload.namespace as string;
  }
  return (
    getAppName(appState).replaceAll(/[^a-zA-Z0-9-_]/g, "_") +
    "-" +
    Math.floor(Math.random() * 10_000)
  );
};

export const createNewAppWithoutGroup = (
  appState: Required<CommonFormFields>,
): components["schemas"]["NewAppWithoutGroupInfo"] => {
  return {
    name: getAppName(appState),
    namespace: generateNamespace(appState),
    projectId: appState.projectId ?? undefined,
    config: createDeploymentConfig(appState),
  };
};

const createGitDeploymentOptions = (
  gitFields: Required<GitFormFields>,
): components["schemas"]["GitDeploymentOptions"] => {
  return {
    source: "git",
    repositoryId: gitFields.repositoryId,
    branch: gitFields.branch,
    rootDir: gitFields.rootDir,
    ...(gitFields.event === "push"
      ? {
          event: "push",
          eventId: null,
        }
      : {
          event: "workflow_run",
          eventId: gitFields.eventId,
        }),
    ...(gitFields.builder === "dockerfile"
      ? {
          builder: "dockerfile",
          dockerfilePath: gitFields.dockerfilePath,
        }
      : {
          builder: "railpack",
        }),
  };
};

const createImageDeploymentOptions = (
  imageFields: Required<ImageFormFields>,
): components["schemas"]["ImageDeploymentOptions"] => {
  return {
    source: "image",
    imageTag: imageFields.imageTag,
  };
};

const getCleanedAppName = (name: string) =>
  name.length > 0
    ? name
        .toLowerCase()
        .substring(0, 60)
        .replace(/[^a-z0-9-]/g, "")
    : "New App";

export const getAppName = ({
  source,
  workload,
  helm,
}: Pick<CommonFormFields, "source" | "workload" | "helm">): string => {
  switch (source) {
    case "git": {
      const gitConfig = workload.git as Required<GitFormFields>;
      return getCleanedAppName(gitConfig.repoName);
    }
    case "image": {
      const imageConfig = workload.image as Required<ImageFormFields>;
      const image = imageConfig.imageTag.split("/");
      const imageName = image[image.length - 1].split(":")[0];
      return getCleanedAppName(imageName);
    }
    case "helm":
      return getCleanedAppName(helm.url!);
    default:
      throw new Error("Invalid source");
  }
};

export const getGroupStateFromApp = (app: App): GroupFormFields => {
  return {
    orgId: app.orgId,
    groupOption: {
      type: app.appGroup.standalone ? "standalone" : "add-to",
      id: app.appGroup.id,
    },
  };
};

export const getFormStateFromApp = (
  app: Pick<App, "displayName" | "projectId" | "config">,
): CommonFormFields => {
  return {
    displayName: app.displayName,
    projectId: app.projectId ?? null,
    appType: app.config.appType,
    source: app.config.source,
    workload:
      app.config.appType === "workload"
        ? getWorkloadFormFieldsFromAppConfig(app.config)
        : createDefaultWorkloadState(),
    helm:
      app.config.appType === "helm"
        ? getHelmFormFieldsFromAppConfig(app.config)
        : {
            urlType: "oci",
          },
  };
};

const getCpuCores = (cpu: string) => {
  return (parseFloat(cpu.replace("m", "")) / 1000).toString();
};

const getWorkloadFormFieldsFromAppConfig = (
  config: components["schemas"]["DeploymentConfig"] & { appType: "workload" },
): WorkloadFormFields => {
  return {
    port: config.port.toString(),
    replicas: config.replicas.toString(),
    env: config.env,
    mounts: config.mounts,
    subdomain: config.subdomain ?? "",
    createIngress: config.createIngress,
    collectLogs: config.collectLogs,
    cpuCores: config.requests?.cpu ? getCpuCores(config.requests?.cpu) : "1",
    memoryInMiB: config.requests?.memory?.replace("Mi", "") ?? "1024",
    git:
      config.source === "git"
        ? {
            builder: config.builder,
            dockerfilePath: config.dockerfilePath ?? "./Dockerfile",
            rootDir: config.rootDir,
            event: config.event,
            eventId: config.eventId,
            repositoryId: config.repositoryId,
            branch: config.branch,
            repoName: "",
          }
        : createDefaultGitState(),
    image:
      config.source === "image"
        ? {
            imageTag: config.imageTag,
          }
        : getDefaultImageState(),
  };
};

const getHelmFormFieldsFromAppConfig = (
  config: components["schemas"]["DeploymentConfig"] & { appType: "helm" },
): HelmFormFields => {
  return {
    url: config.url,
    urlType: config.urlType,
    version: config.version,
    values: config.values,
  };
};

export const makeImageSetter = (
  setState: (updater: (prev: CommonFormFields) => CommonFormFields) => void,
) => {
  return (update: Partial<ImageFormFields>) => {
    setState((prev) => ({
      ...prev,
      workload: {
        ...prev.workload,
        image: { ...prev.workload.image, ...update },
      },
    }));
  };
};

export const makeGitSetter = (
  setState: (updater: (prev: CommonFormFields) => CommonFormFields) => void,
) => {
  return (update: Partial<GitFormFields>) => {
    setState((prev) => ({
      ...prev,
      workload: { ...prev.workload, git: { ...prev.workload.git, ...update } },
    }));
  };
};

export const makeHelmSetter = (
  setState: (updater: (prev: CommonFormFields) => CommonFormFields) => void,
) => {
  return (update: Partial<HelmFormFields>) => {
    setState((prev) => ({ ...prev, helm: { ...prev.helm, ...update } }));
  };
};

export const makeFunctionalWorkloadSetter = (
  setState: (updater: (prev: CommonFormFields) => CommonFormFields) => void,
) => {
  return (update: WorkloadUpdate) => {
    setState((s) => ({
      ...s,
      workload: {
        ...s.workload,
        ...(typeof update === "function" ? update(s.workload) : update),
      },
    }));
  };
};
