import { DiffInput } from "@/components/diff/DiffInput";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
} from "@/components/ui/select";
import type { components } from "@/generated/openapi";
import { api } from "@/lib/api";
import type { CommonFormFields, GitFormFields } from "@/lib/form.types";
import { cn } from "@/lib/utils";
import { GitHubIcon } from "@/pages/create-app/CreateAppView";
import {
  BookMarked,
  ClipboardCheck,
  CloudUpload,
  Container,
  FolderRoot,
  GitBranch,
  Hammer,
} from "lucide-react";
import { DiffSelect } from "../../DiffSelect";

export const GitConfigDiff = ({
  selectedOrg,
  base,
  gitState,
  setGitState,
  disabled = false,
}: {
  selectedOrg?: components["schemas"]["UserOrg"];
  base: CommonFormFields;
  gitState: GitFormFields;
  setGitState: (state: Partial<GitFormFields>) => void;
  disabled?: boolean;
}) => {
  if (!selectedOrg?.gitProvider) {
    if (selectedOrg?.permissionLevel === "OWNER") {
      return (
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
      );
    } else {
      return (
        <p className="my-4">
          <strong>{selectedOrg?.name}</strong> has not been connected to GitHub.
          Ask the owner of your organization to install the AnvilOps GitHub App.
        </p>
      );
    }
  }

  const baseGitState = base.source === "git" ? base.workload.git : null;

  const orgId = selectedOrg.id;
  const { data: repos, isPending: reposLoading } = api.useQuery(
    "get",
    "/org/{orgId}/repos",
    { params: { path: { orgId: selectedOrg.id } } },
  );

  const { data: branches, isPending: branchesLoading } = api.useQuery(
    "get",
    "/org/{orgId}/repos/{repoId}/branches",
    {
      params: {
        path: {
          orgId: orgId,
          repoId: gitState.repositoryId!,
        },
      },
    },
    {
      enabled: gitState.repositoryId !== undefined,
    },
  );

  const { data: workflows, isPending: workflowsLoading } = api.useQuery(
    "get",
    "/org/{orgId}/repos/{repoId}/workflows",
    {
      params: {
        path: {
          orgId: orgId,
          repoId: gitState.repositoryId!,
        },
      },
    },
    {
      enabled:
        gitState.repositoryId !== undefined &&
        gitState.event === "workflow_run",
    },
  );

  const { data: baseWorkflows } = api.useQuery(
    "get",
    "/org/{orgId}/repos/{repoId}/workflows",
    {
      params: {
        path: {
          orgId: orgId,
          repoId: baseGitState!.repositoryId!,
        },
      },
    },
    {
      enabled:
        baseGitState?.repositoryId !== undefined &&
        baseGitState?.event === "workflow_run",
      refetchInterval: false,
    },
  );

  const baseWorkflowName = baseWorkflows?.workflows?.find(
    (workflow) => workflow.id === baseGitState?.eventId,
  )?.name;

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-baseline gap-2">
          <Label
            htmlFor="selectRepo"
            className={cn("pb-1", reposLoading && "opacity-50")}
          >
            <BookMarked className="inline" size={16} />
            Repository
          </Label>
          <span
            className="cursor-default text-red-500"
            title="This field is required."
          >
            *
          </span>
        </div>
        <div className="flex items-center gap-8">
          <DiffSelect
            required
            id="selectRepo"
            name="repo"
            left={baseGitState?.repositoryId?.toString()}
            setRight={(repo) =>
              setGitState({
                repositoryId: typeof repo === "string" ? parseInt(repo) : repo,
                repoName: repos?.find((r) => r?.id === parseInt(repo))?.name,
                branch: undefined,
                eventId: undefined,
              })
            }
            right={gitState.repositoryId?.toString() ?? ""}
            rightPlaceholder="Select a repository"
            disabled={disabled || reposLoading}
          >
            <SelectContent>
              <SelectGroup>
                {repos !== undefined
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
          </DiffSelect>
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex items-baseline gap-2">
          <Label
            htmlFor="selectBranch"
            className={cn(
              "pb-1",
              (gitState.repositoryId === undefined || branchesLoading) &&
                "opacity-50",
            )}
          >
            <GitBranch className="inline" size={16} />
            Branch
          </Label>
          <span
            className="cursor-default text-red-500"
            title="This field is required."
          >
            *
          </span>
        </div>
        <div className="flex items-center gap-8">
          <DiffSelect
            required
            id="selectBranch"
            name="branch"
            disabled={
              disabled || gitState.repositoryId === undefined || branchesLoading
            }
            left={baseGitState?.branch}
            right={gitState.branch ?? ""}
            setRight={(branch) => setGitState({ branch })}
            rightPlaceholder={
              branchesLoading && gitState.repositoryId
                ? "Loading..."
                : "Select a branch"
            }
            leftContent={
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={baseGitState?.branch ?? "N/A"}>
                    {baseGitState?.branch}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            }
          >
            <SelectContent>
              <SelectGroup>
                {gitState.repositoryId !== undefined &&
                  branches?.branches?.map((branch) => {
                    return (
                      <SelectItem key={branch} value={branch}>
                        {branch}
                      </SelectItem>
                    );
                  })}
              </SelectGroup>
            </SelectContent>
          </DiffSelect>
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex items-baseline gap-2">
          <Label htmlFor="deployOnEvent" className="pb-1">
            <CloudUpload className="inline" size={16} />
            Event
          </Label>
          <span
            className="cursor-default text-red-500"
            title="This field is required."
          >
            *
          </span>
        </div>
        <div className="flex items-center gap-8">
          <DiffSelect
            required
            disabled={disabled}
            id="deployOnEvent"
            name="deployOnEvent"
            left={baseGitState?.event}
            right={gitState.event ?? ""}
            setRight={(event) =>
              setGitState({ event: event as "push" | "workflow_run" })
            }
          >
            <SelectContent>
              <SelectItem value="push">Push</SelectItem>
              <SelectItem value="workflow_run">
                Successful workflow run
              </SelectItem>
            </SelectContent>
          </DiffSelect>
        </div>
      </div>
      {gitState.event === "workflow_run" && (
        <div className="space-y-2">
          <div className="flex items-baseline gap-2">
            <Label
              htmlFor="selectWorkflow"
              className={cn(
                "pb-1",
                (gitState.repositoryId === undefined || workflowsLoading) &&
                  "opacity-50",
              )}
            >
              <ClipboardCheck className="inline" size={16} />
              Workflow
            </Label>
            <span
              className="cursor-default text-red-500"
              title="This field is required."
            >
              *
            </span>
          </div>
          <div className="flex items-center gap-8">
            <DiffSelect
              required
              id="selectWorkflow"
              name="workflow"
              disabled={
                disabled ||
                gitState.repositoryId === undefined ||
                branchesLoading ||
                workflows?.workflows?.length === 0
              }
              left={baseGitState?.eventId?.toString() ?? ""}
              right={gitState.eventId?.toString() ?? ""}
              setRight={(eventId) =>
                setGitState({ eventId: parseInt(eventId) })
              }
              rightPlaceholder={
                workflowsLoading || workflows!.workflows!.length > 0
                  ? "Select a workflow"
                  : "No workflows available"
              }
              leftContent={
                <SelectContent>
                  <SelectGroup>
                    <SelectItem
                      value={baseGitState?.eventId?.toString() ?? "N/A"}
                    >
                      {baseWorkflowName}
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              }
            >
              <SelectContent>
                <SelectGroup>
                  {gitState.repositoryId !== undefined &&
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
            </DiffSelect>
          </div>
        </div>
      )}
      <h3 className="mt-4 border-b pb-1 font-bold">Build Options</h3>
      <div>
        <div className="flex items-baseline gap-2">
          <Label htmlFor="rootDir" className="mb-2 pb-1">
            <FolderRoot className="inline" size={16} /> Root directory
          </Label>
          <span
            className="cursor-default text-red-500"
            title="This field is required."
          >
            *
          </span>
        </div>
        <div className="mb-1 flex items-center gap-8">
          <DiffInput
            disabled={disabled}
            left={baseGitState?.rootDir}
            right={gitState.rootDir}
            setRight={(rootDir) => setGitState({ rootDir })}
            name="rootDir"
            id="rootDir"
            placeholder="./"
            pattern="^\.\/.*$"
            autoComplete="off"
            required
          />
        </div>
        <p className="text-xs opacity-50">
          Root directory must start with <code>./</code>
        </p>
      </div>
      <div className="space-y-2">
        <div className="flex items-baseline gap-2">
          <Label className="pb-1" htmlFor="builder">
            <Hammer className="inline" size={16} /> Builder
          </Label>
          <span
            className="cursor-default text-red-500"
            title="This field is required."
          >
            *
          </span>
        </div>
        <RadioGroup
          disabled={disabled}
          name="builder"
          id="builder"
          value={gitState.builder}
          onValueChange={(newValue) =>
            setGitState({ builder: newValue as "dockerfile" | "railpack" })
          }
          required
        >
          <Label
            htmlFor="builder-dockerfile"
            className={cn(
              `border-input focus-within:border-ring focus-within:ring-ring/50 flex items-center gap-2 rounded-lg border p-4 transition-colors outline-none focus-within:ring-[3px]`,
              base.source === "git" &&
                baseGitState?.builder !== gitState.builder
                ? baseGitState?.builder === "dockerfile"
                  ? `bg-red-100 hover:bg-red-200`
                  : "bg-green-50"
                : `bg-inherit hover:bg-gray-50 has-checked:bg-gray-50`,
            )}
          >
            <RadioGroupItem value="dockerfile" id="builder-dockerfile" />
            Dockerfile
            <p className="font-normal opacity-50">
              Builds your app using your Dockerfile.
            </p>
          </Label>
          <Label
            htmlFor="builder-railpack"
            className={cn(
              `border-input focus-within:border-ring focus-within:ring-ring/50 flex items-center gap-2 rounded-lg border p-4 transition-colors outline-none focus-within:ring-[3px]`,
              base.source === "git" &&
                baseGitState?.builder !== gitState.builder
                ? baseGitState?.builder === "railpack"
                  ? `bg-red-100 hover:bg-red-200`
                  : "bg-green-50"
                : `bg-inherit hover:bg-gray-50 has-checked:bg-gray-50`,
            )}
          >
            <RadioGroupItem value="railpack" id="builder-railpack" />
            Railpack
            <p className="font-normal opacity-50">
              Detects your project structure and builds your app automatically.
            </p>
          </Label>
        </RadioGroup>
      </div>
      {gitState.builder === "dockerfile" ? (
        <div>
          <Label className="mb-2 pb-1" htmlFor="dockerfilePath">
            <Container className="inline" size={16} /> Dockerfile Path
            <span
              className="cursor-default text-red-500"
              title="This field is required."
            >
              *
            </span>
          </Label>
          <div className="flex items-center gap-8">
            <DiffInput
              disabled={disabled}
              name="dockerfilePath"
              id="dockerfilePath"
              placeholder="Dockerfile"
              left={baseGitState?.dockerfilePath}
              right={gitState.dockerfilePath}
              setRight={(dockerfilePath) => setGitState({ dockerfilePath })}
              autoComplete="off"
              required
            />
          </div>
          <p className="mt-1 mb-2 text-xs opacity-50">
            Relative to the root directory.
          </p>
        </div>
      ) : null}
    </>
  );
};
