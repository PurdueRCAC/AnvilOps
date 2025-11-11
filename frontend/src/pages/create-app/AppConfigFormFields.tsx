import { useAppConfig } from "@/components/AppConfigProvider";
import { EnvVarGrid } from "@/components/EnvVarGrid";
import { MountsGrid, type Mounts } from "@/components/MountsGrid";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserContext } from "@/components/UserProvider";
import type { components } from "@/generated/openapi";
import { api } from "@/lib/api";
import { useDebouncedValue } from "@/lib/utils";
import {
  Cable,
  Code2,
  Cog,
  Component,
  Cpu,
  Database,
  Fence,
  Info,
  Link,
  Loader,
  MemoryStick,
  Minimize,
  Server,
  Tag,
  Terminal,
  X,
} from "lucide-react";
import { useContext, useMemo, useState, type Dispatch } from "react";
import { GitHubIcon, SubdomainStatus } from "./CreateAppView";
import { GitDeploymentFields } from "./GitDeploymentFields";

export type AppInfoFormData = {
  name?: string;
  port?: string;
  subdomain: string;
  dockerfilePath?: string;
  groupOption?: string;
  groupId?: number;
  projectId?: string;
  env: Env;
  mounts: Mounts;
  orgId?: number;
  repositoryId?: number;
  event?: "push" | "workflow_run";
  eventId?: string;
  repoName?: string;
  imageTag?: string;
  branch?: string;
  rootDir?: string;
  source: "git" | "image";
  builder: "dockerfile" | "railpack";
  postStart?: string;
  preStop?: string;
  cpuCores: number;
  memoryInMiB: number;
};

type Env = { name: string; value: string | null; isSensitive: boolean }[];

const AppConfigFormFields = ({
  state,
  setState,
  isExistingApp,
  hideGroupSelect,
  defaults,
  disabled = false,
}: {
  state: AppInfoFormData;
  setState: Dispatch<React.SetStateAction<AppInfoFormData>>;
  isExistingApp?: boolean;
  hideGroupSelect?: boolean;
  defaults?: {
    config?: components["schemas"]["DeploymentConfig"];
  };
  disabled?: boolean;
}) => {
  const {
    groupOption,
    groupId,
    projectId,
    source,
    env,
    mounts,
    orgId,
    subdomain,
  } = state;

  const { user } = useContext(UserContext);

  const selectedOrg =
    orgId !== undefined ? user?.orgs?.find((it) => it.id === orgId) : undefined;

  const { data: groups, isPending: groupsLoading } = !hideGroupSelect
    ? api.useQuery(
        "get",
        "/org/{orgId}/groups",
        { params: { path: { orgId: orgId! } } },
        {
          enabled: orgId !== undefined,
        },
      )
    : { data: null, isPending: false };

  const MAX_SUBDOMAIN_LENGTH = 54;
  const subdomainIsValid =
    subdomain.length < MAX_SUBDOMAIN_LENGTH &&
    subdomain.match(/^[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?$/) !== null;
  const debouncedSub = useDebouncedValue(subdomain);
  const { data: subStatus, isPending: subLoading } = api.useQuery(
    "get",
    "/app/subdomain",
    {
      params: {
        query: {
          subdomain: debouncedSub,
        },
      },
    },
    { enabled: subdomain == debouncedSub && subdomainIsValid },
  );

  const [groupName, setGroupName] = useState("");
  const isGroupNameValid = useMemo(() => {
    const MAX_GROUP_LENGTH = 56;
    return (
      groupName.length <= MAX_GROUP_LENGTH &&
      groupName.match(/^[a-zA-Z0-9][ a-zA-Z0-9-_\.]*$/)
    );
  }, [groupName]);

  const appConfig = useAppConfig();
  const appDomain = URL.parse(appConfig?.appDomain ?? "");

  const DeploymentOptions = (
    <>
      <h3 className="mt-4 font-bold pb-1 border-b">Deployment Options</h3>

      {!isExistingApp && appDomain !== null && (
        <div className="space-y-2">
          <div className="flex items-baseline gap-2">
            <Label className="pb-1" htmlFor="subdomain">
              <Link className="inline" size={16} /> Public URL
            </Label>
            <span
              className="text-red-500 cursor-default"
              title="This field is required."
            >
              *
            </span>
          </div>
          <div className="flex relative items-center gap-2">
            <span className="absolute left-2 text-sm opacity-50">
              {appDomain?.protocol}//
            </span>
            <Input
              disabled={disabled}
              name="subdomain"
              id="subdomain"
              placeholder="my-app"
              className="w-full pl-14 pr-45"
              required
              pattern="[A-Za-z0-9](?:[A-Za-z0-9\-]{0,61}[A-Za-z0-9])?"
              value={subdomain}
              onChange={(e) => {
                const subdomain = e.currentTarget.value
                  .toLowerCase()
                  .replace(/[^a-z0-9-]/, "-");
                setState((state) => ({
                  ...state,
                  subdomain,
                }));
              }}
              autoComplete="off"
            />
            <span className="absolute right-2 text-sm opacity-50">
              .{appDomain?.host}
            </span>
          </div>
          {subdomain && !subdomainIsValid ? (
            <div className="text-sm flex gap-5">
              <X className="text-red-500" />
              <ul className="text-black-3 list-disc">
                <li>A subdomain must have 54 or fewer characters.</li>
                <li>
                  A subdomain must only contain lowercase alphanumeric
                  characters or dashes(-).
                </li>
                <li>
                  A subdomain must start and end with an alphanumeric character.
                </li>
              </ul>
            </div>
          ) : null}
          {subdomain && subdomainIsValid ? (
            subdomain !== debouncedSub || subLoading ? (
              <span className="text-sm">
                <Loader className="animate-spin inline" /> Checking subdomain...
              </span>
            ) : (
              <>
                <SubdomainStatus available={subStatus!.available} />
                <p className="text-black-3 text-sm flex items-start gap-1">
                  <Info className="inline" />
                  <span>
                    Your application will be reachable at{" "}
                    <code className="text-xs text-black-4 font-bold whitespace-nowrap">
                      anvilops-{subdomain}.anvilops-{subdomain}
                      .svc.cluster.local
                    </code>{" "}
                    from within the cluster.
                  </span>
                </p>
              </>
            )
          ) : null}
        </div>
      )}
      <div className="space-y-2">
        <div className="flex items-baseline gap-2">
          <Label className="pb-1" htmlFor="portNumber">
            <Server className="inline" size={16} /> Port Number
          </Label>
          <span
            className="text-red-500 cursor-default"
            title="This field is required."
          >
            *
          </span>
        </div>
        <Input
          disabled={disabled}
          name="portNumber"
          id="portNumber"
          placeholder="3000"
          className="w-full"
          type="number"
          required
          min="1"
          max="65536"
          value={state.port ?? ""}
          onChange={(e) => {
            const port = e.currentTarget.value;
            setState((state) => ({ ...state, port }));
          }}
        />
      </div>
      <div className="grid grid-cols-2 gap-y-2 gap-x-8">
        <div className="flex items-baseline gap-2">
          <Label className="pb-1" htmlFor="cpuCores">
            <Cpu className="inline" size={16} /> CPU Cores
          </Label>
          <span
            className="text-red-500 cursor-default"
            title="This field is required."
          >
            *
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <Label className="pb-1" htmlFor="memory">
            <MemoryStick className="inline" size={16} /> Memory
          </Label>
          <span
            className="text-red-500 cursor-default"
            title="This field is required."
          >
            *
          </span>
        </div>
        <Input
          name="cpuCores"
          id="cpuCores"
          placeholder="0.5"
          className="w-full"
          type="number"
          required
          step=".001"
          min="0"
          value={state.cpuCores ?? 1}
          onChange={(e) => {
            const cpuCores = e.currentTarget.valueAsNumber;
            setState((state) => ({ ...state, cpuCores }));
          }}
        />
        <div className="flex items-center gap-2">
          <Input
            name="memory"
            id="memory"
            placeholder="1024"
            className="w-full"
            type="number"
            required
            min="1"
            value={state.memoryInMiB ?? 1024}
            onChange={(e) => {
              const memoryInMiB = e.currentTarget.valueAsNumber;
              setState((state) => ({ ...state, memoryInMiB }));
            }}
          />
          MiB
        </div>
      </div>
      <Accordion type="single" collapsible>
        <AccordionItem value="env">
          <AccordionTrigger>
            <Label className="pb-1">
              <Code2 className="inline" size={16} /> Environment Variables
            </Label>
          </AccordionTrigger>
          <AccordionContent className="px-4">
            <EnvVarGrid
              value={env}
              setValue={(env) => {
                setState((prev) => {
                  return {
                    ...prev,
                    env: typeof env === "function" ? env(prev.env) : env,
                  };
                });
              }}
              fixedSensitiveNames={
                defaults?.config
                  ? new Set(
                      defaults.config.env
                        .filter((env) => env.isSensitive)
                        .map((env) => env.name),
                    )
                  : new Set()
              }
              disabled={disabled}
            />
          </AccordionContent>
        </AccordionItem>
        {appConfig.storageEnabled && (
          <AccordionItem value="mounts">
            <AccordionTrigger>
              <Label className="pb-1">
                <Database className="inline" size={16} /> Volume Mounts
              </Label>
            </AccordionTrigger>
            <AccordionContent className="px-4">
              {!!isExistingApp && (
                <p className="col-span-full text-amber-600">
                  Volume mounts cannot be edited after an app has been created.
                </p>
              )}
              <p className="opacity-50 text-sm mb-4">
                Preserve files contained at these paths across app restarts. All
                other files will be discarded. Every replica will get its own
                separate volume.
              </p>
              <MountsGrid
                readonly={disabled || isExistingApp} // If we're in the Config tab of an existing application, mounts should not be editable. Kubernetes doesn't allow editing volumes after creating a StatefulSet, and we haven't implemented a workaround yet.
                value={mounts}
                setValue={(mounts) =>
                  setState((prev) => ({
                    ...prev,
                    mounts:
                      typeof mounts === "function"
                        ? mounts(prev.mounts)
                        : mounts,
                  }))
                }
              />
            </AccordionContent>
          </AccordionItem>
        )}
        <AccordionItem value="advanced">
          <AccordionTrigger>
            <Label className="pb-1">
              <Cog className="inline" size={16} /> Advanced
            </Label>
          </AccordionTrigger>
          <AccordionContent className="space-y-10 px-4 mt-2">
            <div className="space-y-2">
              <div>
                <Label className="pb-1" htmlFor="postStart">
                  <Terminal className="inline" size={16} /> Post-Start Command
                </Label>
                <p className="text-sm text-black-2">
                  Run a shell(sh) command on each pod of your app immediately
                  after it starts, and before it becomes reachable.
                </p>
              </div>
              <Input
                disabled={disabled}
                name="postStart"
                id="postStart"
                placeholder="echo Hello World"
                className="w-full"
                value={state.postStart ?? ""}
                onChange={(e) => {
                  const postStart = e.currentTarget.value;
                  setState((state) => ({ ...state, postStart }));
                }}
              />
            </div>
            <div className="space-y-2">
              <div>
                <Label className="pb-1" htmlFor="preStop">
                  <Minimize className="inline" size={16} /> Pre-Stop Command
                </Label>
                <p className="text-sm text-black-2">
                  Run a shell(sh) command on each pod of your app just before it
                  is deleted.
                </p>
              </div>
              <Input
                disabled={disabled}
                name="preStop"
                id="preStop"
                placeholder="echo Goodbye"
                className="w-full"
                value={state.preStop ?? ""}
                onChange={(e) => {
                  const preStop = e.currentTarget.value;
                  setState((state) => ({ ...state, preStop }));
                }}
              />
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </>
  );

  return (
    <>
      {!hideGroupSelect && (
        <>
          <h3 className="mt-4 font-bold pb-1 border-b">Grouping Options</h3>
          <div className="space-y-2">
            <div>
              <div className="flex items-baseline gap-2">
                <Label htmlFor="selectGroup" className="pb-1">
                  <Component className="inline" size={16} />
                  Group
                </Label>
                <span
                  className="text-red-500 cursor-default"
                  title="This field is required."
                >
                  *
                </span>
              </div>
              <p className="text-sm text-black-2">
                Applications can be created as standalone apps, or as part of a
                group of related microservices.
              </p>
            </div>
            <Select
              required
              disabled={disabled || orgId === undefined || groupsLoading}
              onValueChange={(groupOption) => {
                const groupId = parseInt(groupOption);
                if (isNaN(groupId)) {
                  setState((prev) => ({
                    ...prev,
                    groupOption: groupOption,
                    groupId: undefined,
                  }));
                } else {
                  setState((prev) => ({
                    ...prev,
                    groupOption: "add-to",
                    groupId,
                  }));
                }
              }}
              value={
                groupOption === "add-to" ? groupId?.toString() : groupOption
              }
              name="group"
            >
              <SelectTrigger className="w-full" id="selectGroup">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="standalone">Standalone app</SelectItem>
                  <SelectItem value="create-new">Create new group</SelectItem>
                  {groups && groups.length > 0 && (
                    <>
                      <SelectLabel key="add-label">
                        Add to existing group
                      </SelectLabel>
                      {groups?.map((group) => (
                        <SelectItem key={group.id} value={group.id.toString()}>
                          {group.name}
                        </SelectItem>
                      ))}
                    </>
                  )}
                </SelectGroup>
              </SelectContent>
            </Select>

            {groupOption === "create-new" && (
              <>
                <div className="flex items-baseline gap-2">
                  <Label htmlFor="groupName" className="pb-1">
                    Group Name
                  </Label>
                  <span
                    className="text-red-500 cursor-default"
                    title="This field is required."
                  >
                    *
                  </span>
                </div>
                <Input
                  required
                  disabled={disabled}
                  placeholder="Group name"
                  name="groupName"
                  value={groupName}
                  onChange={(e) => setGroupName(e.currentTarget.value)}
                  autoComplete="off"
                />
                {groupName && !isGroupNameValid && (
                  <div className="text-sm flex gap-5">
                    <X className="text-red-500" />
                    <ul className="text-black-3 list-disc">
                      <li>A group name must have 56 or fewer characters.</li>
                      <li>
                        A group name must contain only alphanumeric characters,
                        dashes, underscores, dots, and spaces.
                      </li>
                      <li>
                        A group name must start with an alphanumeric character.
                      </li>
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
      {appConfig.isRancherManaged && (
        <div className="space-y-2">
          <div>
            <div className="flex items-baseline gap-2">
              <Label htmlFor="selectProject" className="pb-1">
                <Fence className="inline" size={16} />
                Project
              </Label>
              <span
                className="text-red-500 cursor-default"
                title="This field is required."
              >
                *
              </span>
            </div>
            <p className="text-sm text-black-3">
              In clusters managed by Rancher, resources are organized into
              projects for administration.
            </p>
          </div>
          <Select
            required
            name="project"
            value={projectId ?? ""}
            onValueChange={(projectId) =>
              setState((prev) => ({ ...prev, projectId }))
            }
          >
            <SelectTrigger className="w-full" id="selectProject">
              <SelectValue placeholder="Select a Project" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {user?.projects?.map((project) => (
                  <SelectItem key={project.id} value={project.id.toString()}>
                    <p>
                      {project.name}{" "}
                      <span className="text-sm text-black-2">
                        {project.description}
                      </span>
                    </p>
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      )}
      <h3 className="mt-4 font-bold pb-1 border-b">Source Options</h3>
      <div className="space-y-2">
        <div className="flex items-baseline gap-2">
          <Label htmlFor="deploymentSource" className="pb-1">
            <Cable className="inline" size={16} />
            Deployment Source
          </Label>
          <span
            className="text-red-500 cursor-default"
            title="This field is required."
          >
            *
          </span>
        </div>
        <Select
          required
          disabled={disabled}
          value={source}
          onValueChange={(source) =>
            setState((prev) => ({ ...prev, source: source as "git" | "image" }))
          }
          name="source"
        >
          <SelectTrigger className="w-full" id="deploymentSource">
            <SelectValue placeholder="Select deployment source" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="git">Git Repository</SelectItem>
              <SelectItem value="image">OCI Image</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      {source === "git" ? (
        selectedOrg?.githubConnected ? (
          <GitDeploymentFields
            orgId={orgId}
            state={state}
            setState={setState}
            disabled={disabled}
          />
        ) : selectedOrg?.permissionLevel === "OWNER" ? (
          <div>
            <p className="mt-4">
              <strong>{selectedOrg?.name}</strong> has not been connected to
              GitHub.
            </p>
            <p className="mb-4">
              AnvilOps integrates with GitHub to deploy your app as soon as you
              push to your repository.
            </p>
            <a
              className="flex w-full"
              href={`/api/org/${selectedOrg?.id}/install-github-app`}
            >
              <Button className="w-full" type="button">
                <GitHubIcon />
                Install GitHub App
              </Button>
            </a>
          </div>
        ) : (
          <>
            <p className="my-4">
              <strong>{selectedOrg?.name}</strong> has not been connected to
              GitHub. Ask the owner of your organization to install the AnvilOps
              GitHub App.
            </p>
          </>
        )
      ) : source === "image" ? (
        <>
          <div className="space-y-2">
            <div className="flex items-baseline gap-2">
              <Label htmlFor="imageTag" className="pb-1 mb-2">
                <Tag className="inline" size={16} /> Image tag
              </Label>
              <span
                className="text-red-500 cursor-default"
                title="This field is required."
              >
                *
              </span>
            </div>
            <Input
              disabled={disabled}
              value={state.imageTag ?? ""}
              onChange={(e) => {
                const imageTag = e.currentTarget.value;
                setState((state) => ({ ...state, imageTag }));
              }}
              name="imageTag"
              id="imageTag"
              placeholder="nginx:latest"
              className="w-full"
              // Docker image name format: https://pkg.go.dev/github.com/distribution/reference#pkg-overview
              // Regex: https://stackoverflow.com/a/39672069
              pattern="^(?:(?=[^:\/]{4,253})(?!-)[a-zA-Z0-9\-]{1,63}(?<!-)(?:\.(?!-)[a-zA-Z0-9\-]{1,63}(?<!-))*(?::[0-9]{1,5})?\/)?((?![._\-])(?:[a-z0-9._\-]*)(?<![._\-])(?:\/(?![._\-])[a-z0-9._\-]*(?<![._\-]))*)(?::(?![.\-])[a-zA-Z0-9_.\-]{1,128})?$"
              required
            />
          </div>
        </>
      ) : null}

      {(source !== "git" || selectedOrg?.githubConnected) && DeploymentOptions}
    </>
  );
};

export default AppConfigFormFields;
