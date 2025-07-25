import { Input } from "@/components/ui/input";
import { UserContext } from "@/components/UserProvider";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
import {
  BookMarked,
  MoveRight,
  GitBranch,
  CloudUpload,
  ClipboardCheck,
  FolderRoot,
  Hammer,
  Container,
} from "lucide-react";
import { useContext, useEffect } from "react";
import type { DeploymentConfigFormData } from "./AppConfigDiff";

export const GitConfigDiff = ({
  orgId,
  base,
  state,
  setState,
}: {
  orgId: number;
  base: DeploymentConfigFormData;
  state: DeploymentConfigFormData;
  setState: (
    callback: (s: DeploymentConfigFormData) => DeploymentConfigFormData,
  ) => void;
}) => {
  const { user } = useContext(UserContext);

  const selectedOrg =
    orgId !== undefined ? user?.orgs?.find((it) => it.id === orgId) : undefined;

  const { data: repos, isPending: reposLoading } = api.useQuery(
    "get",
    "/org/{orgId}/repos",
    { params: { path: { orgId: orgId! } } },
    {
      enabled:
        orgId !== undefined &&
        state.source === "git" &&
        selectedOrg?.githubConnected,
    },
  );

  const { data: branches, isPending: branchesLoading } = api.useQuery(
    "get",
    "/org/{orgId}/repos/{repoId}/branches",
    {
      params: {
        path: {
          orgId: orgId!,
          repoId: state.repositoryId!,
        },
      },
    },
    {
      enabled:
        orgId !== undefined &&
        state.repositoryId !== undefined &&
        state.source === "git",
    },
  );

  const { data: workflows, isPending: workflowsLoading } = api.useQuery(
    "get",
    "/org/{orgId}/repos/{repoId}/workflows",
    {
      params: {
        path: {
          orgId: orgId!,
          repoId: state.repositoryId!,
        },
      },
    },
    {
      enabled:
        orgId !== undefined &&
        state.repositoryId !== undefined &&
        state.source === "git" &&
        state.event === "workflow_run",
    },
  );

  useEffect(() => {
    setState((prev) => ({
      ...prev,
      branch: branches?.default ?? branches?.branches?.[0],
    }));
  }, [branches]);

  const shouldDiffBranch =
    state.repositoryId && base.repositoryId === state.repositoryId;
  const shouldDiffEvent =
    shouldDiffBranch && state.branch && base.branch === state.branch;
  const shouldDiffEventId =
    shouldDiffEvent && state.event && base.event === state.event;

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-baseline gap-2">
          <Label
            htmlFor="selectRepo"
            className={cn(
              "pb-1",
              (orgId === undefined || reposLoading) && "opacity-50",
            )}
          >
            <BookMarked className="inline" size={16} />
            Repository
          </Label>
          <span
            className="text-red-500 cursor-default"
            title="This field is required."
          >
            *
          </span>
        </div>
        <div className="flex items-center gap-8">
          <Select required disabled value={base.repositoryId?.toString()}>
            <SelectTrigger
              className={cn(
                "w-full",
                state.repositoryId &&
                  (base.repositoryId !== state.repositoryId
                    ? "bg-red-200"
                    : null),
              )}
            >
              <SelectValue placeholder="Loading..." />
            </SelectTrigger>
            <SelectContent>
              {!reposLoading && (
                <SelectItem value={base.repositoryId!.toString()}>
                  {(() => {
                    const repo = repos?.find(
                      (repo) => repo.id === base.repositoryId,
                    );
                    return `${repo?.owner}/${repo?.name}`;
                  })()}
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          <div>
            <MoveRight />
          </div>
          <Select
            required
            name="repo"
            disabled={orgId === undefined || reposLoading}
            onValueChange={(repo) => {
              setState((prev) => ({
                ...prev,
                repositoryId: typeof repo === "string" ? parseInt(repo) : repo,
                repoName: repos?.find((r) => r?.id === parseInt(repo))?.name,
              }));
            }}
            value={state.repositoryId?.toString() ?? ""}
          >
            <SelectTrigger
              className={cn(
                "w-full",
                state.repositoryId &&
                  base.repositoryId !== state.repositoryId &&
                  "bg-green-50",
              )}
              id="selectRepo"
            >
              <SelectValue
                placeholder={
                  reposLoading && orgId !== undefined
                    ? "Loading..."
                    : "Select a repository"
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {orgId !== undefined && !!repos
                  ? Object.entries(
                      Object.groupBy(repos, (repo) => repo.owner!),
                    ).map(([owner, repos]) => (
                      <SelectGroup key={owner}>
                        <SelectLabel>{owner}</SelectLabel>
                        {repos?.map((repo) => (
                          <SelectItem key={repo.id} value={repo.id!.toString()}>
                            {repo.owner}/{repo.name}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))
                  : null}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex items-baseline gap-2">
          <Label
            htmlFor="selectBranch"
            className={cn(
              "pb-1",
              (state.repositoryId === undefined || branchesLoading) &&
                "opacity-50",
            )}
          >
            <GitBranch className="inline" size={16} />
            Branch
          </Label>
          <span
            className="text-red-500 cursor-default"
            title="This field is required."
          >
            *
          </span>
        </div>
        <div className="flex items-center gap-8">
          {shouldDiffBranch && (
            <>
              <Select disabled value={base.branch}>
                <SelectTrigger
                  className={cn(
                    "w-full",
                    state.branch &&
                      base.branch !== state.branch &&
                      "bg-red-200",
                  )}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={base.branch!}>{base.branch}</SelectItem>
                </SelectContent>
              </Select>
              <div>
                <MoveRight />
              </div>
            </>
          )}
          <Select
            required
            name="branch"
            disabled={state.repositoryId === undefined || branchesLoading}
            value={state.branch ?? ""}
            onValueChange={(branch) => {
              setState((prev) => ({ ...prev, branch }));
            }}
          >
            <SelectTrigger
              className={cn(
                "w-full",
                shouldDiffBranch &&
                  state.branch &&
                  base.branch !== state.branch &&
                  "bg-green-50",
              )}
              id="selectBranch"
            >
              <SelectValue
                placeholder={
                  branchesLoading && state.repositoryId !== undefined
                    ? "Loading..."
                    : "Select a branch"
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {state.repositoryId !== undefined &&
                  branches?.branches?.map((branch) => {
                    return (
                      <SelectItem key={branch} value={branch}>
                        {branch}
                      </SelectItem>
                    );
                  })}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex items-baseline gap-2">
          <Label htmlFor="deployOnEvent" className="pb-1">
            <CloudUpload className="inline" size={16} />
            Event
          </Label>
          <span
            className="text-red-500 cursor-default"
            title="This field is required."
          >
            *
          </span>
        </div>
        <div className="flex items-center gap-8">
          {shouldDiffEvent && (
            <>
              <Select disabled value={base.event}>
                <SelectTrigger
                  className={cn(
                    "w-full",
                    state.event && base.event !== state.event && "bg-red-200",
                  )}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="push">Push</SelectItem>
                  <SelectItem value="workflow_run">
                    Successful workflow run
                  </SelectItem>
                </SelectContent>
              </Select>
              <div>
                <MoveRight />
              </div>
            </>
          )}
          <Select
            required
            name="branch"
            value={state.event ?? ""}
            onValueChange={(event) => {
              setState((prev) => ({
                ...prev,
                event: event as "push" | "workflow_run",
              }));
            }}
          >
            <SelectTrigger
              className={cn(
                "w-full",
                shouldDiffEvent &&
                  state.event &&
                  base.event !== state.event &&
                  "bg-green-50",
              )}
              id="selectEvent"
            >
              <SelectValue placeholder="Select an event" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="push">Push</SelectItem>
              <SelectItem value="workflow_run">
                Successful workflow run
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {state.event === "workflow_run" && (
        <div className="space-y-2">
          <div className="flex items-baseline gap-2">
            <Label
              htmlFor="selectWorkflow"
              className={cn(
                "pb-1",
                (state.repositoryId === undefined || workflowsLoading) &&
                  "opacity-50",
              )}
            >
              <ClipboardCheck className="inline" size={16} />
              Workflow
            </Label>
            <span
              className="text-red-500 cursor-default"
              title="This field is required."
            >
              *
            </span>
          </div>
          <div className="flex items-center gap-8">
            {shouldDiffEventId && (
              <>
                <Select disabled value={base.eventId}>
                  <SelectTrigger
                    className={cn(
                      "w-full",
                      shouldDiffEventId &&
                        state.eventId &&
                        base.eventId !== state.eventId &&
                        "bg-red-200",
                    )}
                  >
                    <SelectValue placeholder="Loading..." />
                  </SelectTrigger>
                  <SelectContent>
                    {!workflowsLoading && (
                      <SelectItem value={base.eventId!.toString()}>
                        {
                          workflows?.workflows?.find(
                            (workflow) =>
                              workflow.id.toString() === base.eventId,
                          )?.name
                        }
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <div>
                  <MoveRight />
                </div>
              </>
            )}
            <Select
              required
              name="workflow"
              disabled={
                state.repositoryId === undefined ||
                branchesLoading ||
                workflows?.workflows?.length === 0
              }
              value={state.eventId?.toString() ?? ""}
              onValueChange={(eventId) => {
                setState((prev) => ({ ...prev, eventId }));
              }}
            >
              <SelectTrigger
                className={cn(
                  "w-full",
                  shouldDiffEventId &&
                    state.eventId &&
                    base.eventId !== state.eventId &&
                    "bg-green-50",
                )}
                id="selectWorkflow"
              >
                <SelectValue
                  placeholder={
                    workflowsLoading || workflows!.workflows!.length > 0
                      ? "Select a workflow"
                      : "No workflows available"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {state.repositoryId !== undefined &&
                    workflows?.workflows?.map((workflow) => {
                      return (
                        <SelectItem
                          key={workflow.id}
                          value={workflow.id.toString()}
                        >
                          {workflow.name}
                        </SelectItem>
                      );
                    })}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
      <h3 className="mt-4 font-bold pb-1 border-b">Build Options</h3>
      <div>
        <div className="flex items-baseline gap-2">
          <Label htmlFor="rootDir" className="pb-1 mb-2">
            <FolderRoot className="inline" size={16} /> Root directory
          </Label>
          <span
            className="text-red-500 cursor-default"
            title="This field is required."
          >
            *
          </span>
        </div>
        <div className="flex items-center gap-8 mb-1">
          <Input
            disabled
            value={base.rootDir}
            className={cn(
              "w-full",
              base.rootDir !== state.rootDir && "bg-red-200",
            )}
          />
          <div>
            <MoveRight />
          </div>
          <Input
            value={state.rootDir}
            onChange={(e) => {
              const rootDir = e.currentTarget.value;
              setState((state) => ({ ...state, rootDir }));
            }}
            name="rootDir"
            id="rootDir"
            placeholder="./"
            className={cn(
              "w-full",
              base.rootDir !== state.rootDir && "bg-green-50",
            )}
            pattern="^\.\/.*$"
            autoComplete="off"
            required
          />
        </div>
        <p className="opacity-50 text-xs">
          Root directory must start with <code>./</code>
        </p>
      </div>
      <div className="space-y-2">
        <div className="flex items-baseline gap-2">
          <Label className="pb-1" htmlFor="builder">
            <Hammer className="inline" size={16} /> Builder
          </Label>
          <span
            className="text-red-500 cursor-default"
            title="This field is required."
          >
            *
          </span>
        </div>
        <RadioGroup
          name="builder"
          id="builder"
          value={state.builder}
          onValueChange={(newValue) =>
            setState((prev) => ({
              ...prev,
              builder: newValue as "dockerfile" | "railpack",
            }))
          }
          required
        >
          <Label
            htmlFor="builder-dockerfile"
            className={cn(
              "flex items-center gap-2 border border-input rounded-lg p-4 focus-within:border-ring focus-within:ring-ring/50 outline-none focus-within:ring-[3px] transition-colors",
              base.builder !== state.builder
                ? base.builder === "dockerfile"
                  ? "bg-red-100 hover:bg-red-200"
                  : "bg-green-50"
                : "bg-inherit hover:bg-gray-50 has-checked:bg-gray-50",
            )}
          >
            <RadioGroupItem value="dockerfile" id="builder-dockerfile" />
            Dockerfile
            <p className="opacity-50 font-normal">
              Builds your app using your Dockerfile.
            </p>
          </Label>
          <Label
            htmlFor="builder-railpack"
            className={cn(
              "flex items-center gap-2 border border-input rounded-lg p-4 focus-within:border-ring focus-within:ring-ring/50 outline-none focus-within:ring-[3px] transition-colors",
              base.builder !== state.builder
                ? base.builder === "railpack"
                  ? "bg-red-100 hover:bg-red-200"
                  : "bg-green-50"
                : "bg-inherit hover:bg-gray-50 has-checked:bg-gray-50",
            )}
          >
            <RadioGroupItem value="railpack" id="builder-railpack" />
            Railpack
            <p className="opacity-50 font-normal">
              Detects your project structure and builds your app automatically.
            </p>
          </Label>
        </RadioGroup>
      </div>
      {state.builder === "dockerfile" ? (
        <div>
          <Label className="pb-1 mb-2" htmlFor="dockerfilePath">
            <Container className="inline" size={16} /> Dockerfile Path
            <span
              className="text-red-500 cursor-default"
              title="This field is required."
            >
              *
            </span>
          </Label>
          <div className="flex items-center gap-8">
            {base.builder === "dockerfile" && (
              <>
                <Input
                  disabled
                  value={base.dockerfilePath}
                  className={cn(
                    "w-full",
                    state.dockerfilePath &&
                      base.dockerfilePath !== state.dockerfilePath &&
                      "bg-red-200",
                  )}
                />
                <div>
                  <MoveRight />
                </div>
              </>
            )}
            <Input
              name="dockerfilePath"
              id="dockerfilePath"
              placeholder="Dockerfile"
              value={state.dockerfilePath}
              onChange={(e) => {
                const dockerfilePath = e.currentTarget.value;
                setState((state) => ({ ...state, dockerfilePath }));
              }}
              className={cn(
                "w-full",
                base.builder === "dockerfile" &&
                  base.dockerfilePath !== state.dockerfilePath &&
                  "bg-green-50",
              )}
              autoComplete="off"
              required
            />
          </div>
          <p className="opacity-50 text-xs mb-2 mt-1">
            Relative to the root directory.
          </p>
        </div>
      ) : null}
    </>
  );
};
