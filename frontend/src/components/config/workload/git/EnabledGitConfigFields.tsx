import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import type { CommonFormFields, GitFormFields } from "@/lib/form.types";
import clsx from "clsx";
import {
  BookMarked,
  ClipboardCheck,
  CloudUpload,
  Container,
  FolderRoot,
  GitBranch,
  Hammer,
} from "lucide-react";
import { useEffect, useState } from "react";
import { ImportRepoDialog } from "./ImportRepoDialog";

export const EnabledGitConfigFields = ({
  orgId,
  gitState,
  setState,
  disabled,
}: {
  orgId?: number;
  gitState: GitFormFields;
  setState: (updater: (prev: CommonFormFields) => CommonFormFields) => void;
  disabled?: boolean;
}) => {
  const setGitState = (update: Partial<GitFormFields>) => {
    setState((s) => ({
      ...s,
      workload: {
        ...s.workload,
        git: {
          ...s.workload.git,
          ...update,
        },
      },
    }));
  };

  const {
    builder,
    repositoryId,
    event,
    eventId,
    rootDir,
    dockerfilePath,
    branch,
  } = gitState;
  const {
    data: repos,
    isPending: reposLoading,
    refetch: refreshRepos,
  } = api.useQuery(
    "get",
    "/org/{orgId}/repos",
    { params: { path: { orgId: orgId! } } },
    {
      enabled: orgId !== undefined,
    },
  );

  const { data: branches, isPending: branchesLoading } = api.useQuery(
    "get",
    "/org/{orgId}/repos/{repoId}/branches",
    {
      params: {
        path: {
          orgId: orgId!,
          repoId: repositoryId!,
        },
      },
    },
    {
      enabled: orgId !== undefined && repositoryId !== undefined,
      // Sometimes when a repository was just created, the list of branches is empty and listRepoBranches returns a 404
      retry(failureCount, error) {
        if (error && "code" in error && error.code === 404) {
          return failureCount < 3;
        }
        return false;
      },
      retryDelay(attemptIndex) {
        return Math.min(500 * 2 ** attemptIndex, 4000);
      },
    },
  );

  const { data: workflows, isPending: workflowsLoading } = api.useQuery(
    "get",
    "/org/{orgId}/repos/{repoId}/workflows",
    {
      params: {
        path: {
          orgId: orgId!,
          repoId: repositoryId!,
        },
      },
    },
    {
      enabled:
        orgId !== undefined &&
        repositoryId !== undefined &&
        event === "workflow_run",
    },
  );

  useEffect(() => {
    if (!branch) {
      setGitState({ branch: branches?.default ?? branches?.branches?.[0] });
    }
  }, [branches]);

  const [importDialogShown, setImportDialogShown] = useState(false);
  return (
    <>
      {orgId !== undefined && (
        <ImportRepoDialog
          orgId={orgId}
          open={importDialogShown}
          setOpen={setImportDialogShown}
          refresh={async () => {
            await refreshRepos();
          }}
          setState={setState}
        />
      )}
      <div className="space-y-2">
        <div className="flex items-baseline gap-2">
          <Label
            htmlFor="selectRepo"
            className={clsx(
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

        <Select
          required
          name="repo"
          disabled={disabled || orgId === undefined || reposLoading}
          onValueChange={(repo) => {
            if (repo === "$import-repo") {
              setImportDialogShown(true);
            } else if (repo) {
              setGitState({
                repositoryId: typeof repo === "string" ? parseInt(repo) : repo,
                repoName: repos?.find((r) => r?.id === parseInt(repo))?.name,
              });
            }
          }}
          value={repositoryId?.toString() ?? ""}
        >
          <SelectTrigger className="w-full peer" id="selectRepo">
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
            <SelectGroup>
              <SelectLabel>Import</SelectLabel>
              <SelectItem value="$import-repo">
                External Git repository...
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <div className="flex items-baseline gap-2">
          <Label
            htmlFor="selectBranch"
            className={clsx(
              "pb-1",
              (repositoryId === undefined || branchesLoading) && "opacity-50",
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
        <Select
          required
          name="branch"
          disabled={disabled || repositoryId === undefined || branchesLoading}
          value={branch ?? ""}
          onValueChange={(branch) => {
            setGitState({ branch });
          }}
        >
          <SelectTrigger className="w-full" id="selectBranch">
            <SelectValue
              placeholder={
                branchesLoading && repositoryId !== undefined
                  ? "Loading..."
                  : "Select a branch"
              }
            />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {repositoryId !== undefined &&
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
        <Select
          required
          disabled={disabled}
          name="branch"
          value={event ?? ""}
          onValueChange={(event) => {
            setGitState({ event: event as "push" | "workflow_run" });
          }}
        >
          <SelectTrigger className="w-full" id="selectEvent">
            <SelectValue placeholder="Select an event" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="push">Push</SelectItem>
              <SelectItem value="workflow_run">
                Successful workflow run
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      {event === "workflow_run" && (
        <div className="space-y-2">
          <div className="flex items-baseline gap-2">
            <Label
              htmlFor="selectWorkflow"
              className={clsx(
                "pb-1",
                (repositoryId === undefined || workflowsLoading) &&
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
          <Select
            required
            name="workflow"
            disabled={
              disabled ||
              repositoryId === undefined ||
              branchesLoading ||
              workflows?.workflows?.length === 0
            }
            value={eventId?.toString() ?? ""}
            onValueChange={(eventId) => {
              setGitState({ eventId: parseInt(eventId) });
            }}
          >
            <SelectTrigger className="w-full" id="selectWorkflow">
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
                {repositoryId !== undefined &&
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
        <Input
          disabled={disabled}
          value={rootDir}
          onChange={(e) => {
            const rootDir = e.currentTarget.value;
            setGitState({ rootDir });
          }}
          name="rootDir"
          id="rootDir"
          placeholder="./"
          className="w-full mb-1"
          pattern="^\.\/.*$"
          autoComplete="off"
          required
        />
        <p className="opacity-50 text-xs">
          Must start with <code>./</code>
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
          disabled={disabled}
          name="builder"
          id="builder"
          value={builder}
          onValueChange={(newValue) =>
            setGitState({ builder: newValue as "dockerfile" | "railpack" })
          }
          required
        >
          <Label
            htmlFor="builder-dockerfile"
            className="flex items-center gap-2 border border-input rounded-lg p-4 has-checked:bg-gray-50 hover:bg-gray-50 focus-within:border-ring focus-within:ring-ring/50 outline-none focus-within:ring-[3px] transition-colors"
          >
            <RadioGroupItem value="dockerfile" id="builder-dockerfile" />
            Dockerfile
            <p className="opacity-50 font-normal">
              Builds your app using your Dockerfile.
            </p>
          </Label>
          <Label
            htmlFor="builder-railpack"
            className="flex items-center gap-2 border border-input rounded-lg p-4 has-checked:bg-gray-50 hover:bg-gray-50 focus-within:border-ring focus-within:ring-ring/50 outline-none focus-within:ring-[3px] transition-colors"
          >
            <RadioGroupItem value="railpack" id="builder-railpack" />
            Railpack
            <p className="opacity-50 font-normal">
              Detects your project structure and builds your app automatically.
            </p>
          </Label>
        </RadioGroup>
      </div>
      {builder === "dockerfile" ? (
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
          <Input
            disabled={disabled}
            name="dockerfilePath"
            id="dockerfilePath"
            placeholder="Dockerfile"
            value={dockerfilePath ?? ""}
            onChange={(e) => {
              const dockerfilePath = e.currentTarget.value;
              setGitState({ dockerfilePath });
            }}
            className="w-full"
            autoComplete="off"
            required
          />
          <p className="opacity-50 text-xs mb-2 mt-1">
            Relative to the root directory.
          </p>
        </div>
      ) : null}
    </>
  );
};
