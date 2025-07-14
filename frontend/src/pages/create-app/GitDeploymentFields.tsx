import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectLabel,
  SelectItem,
} from "@/components/ui/select";
import { UserContext } from "@/components/UserProvider";
import { api } from "@/lib/api";
import clsx from "clsx";
import {
  BookMarked,
  GitBranch,
  CloudUpload,
  ClipboardCheck,
  FolderRoot,
  Container,
  Hammer,
} from "lucide-react";
import { useContext, useEffect, useState } from "react";
import type { AppInfoFormData } from "./AppConfigFormFields";
import { ImportRepoDialog } from "@/components/ImportRepoDialog";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export const GitDeploymentFields = ({
  orgId,
  state,
  setState,
}: {
  orgId?: number;
  state: AppInfoFormData;
  setState: React.Dispatch<React.SetStateAction<AppInfoFormData>>;
}) => {
  const { builder, repositoryId, event, eventId, source } = state;

  const { user } = useContext(UserContext);

  const selectedOrg =
    orgId !== undefined ? user?.orgs?.find((it) => it.id === orgId) : undefined;

  const {
    data: repos,
    isPending: reposLoading,
    refetch: refreshRepos,
  } = api.useQuery(
    "get",
    "/org/{orgId}/repos",
    { params: { path: { orgId: orgId! } } },
    {
      enabled:
        orgId !== undefined && source === "git" && selectedOrg?.githubConnected,
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
      enabled:
        orgId !== undefined && repositoryId !== undefined && source === "git",
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
        source === "git" &&
        event === "workflow_run",
    },
  );

  useEffect(() => {
    setState((prev) => ({
      ...prev,
      branch: branches?.default ?? branches?.branches?.[0],
    }));
  }, [branches]);

  const [importDialogShown, setImportDialogShown] = useState(false);
  return (
    <>
      {selectedOrg?.id && (
        <ImportRepoDialog
          orgId={selectedOrg?.id}
          open={importDialogShown}
          setOpen={setImportDialogShown}
          refresh={async () => {
            await refreshRepos();
          }}
          setRepo={(repositoryId, repoName) =>
            setState((prev) => ({
              ...prev,
              repositoryId,
              repoName,
            }))
          }
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
          disabled={orgId === undefined || reposLoading}
          onValueChange={(repo) => {
            if (repo === "$import-repo") {
              setImportDialogShown(true);
            } else if (repo) {
              setState((prev) => ({
                ...prev,
                repositoryId: typeof repo === "string" ? parseInt(repo) : repo,
                repoName: repos?.find((r) => r?.id === parseInt(repo))?.name,
              }));
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
          disabled={repositoryId === undefined || branchesLoading}
          value={state.branch ?? ""}
          onValueChange={(branch) => {
            setState((prev) => ({ ...prev, branch }));
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
          name="branch"
          value={state.event ?? ""}
          onValueChange={(event) => {
            setState((prev) => ({
              ...prev,
              event: event as "push" | "workflow_run",
            }));
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
              repositoryId === undefined ||
              branchesLoading ||
              workflows?.workflows?.length === 0
            }
            value={eventId ?? ""}
            onValueChange={(eventId) => {
              setState((prev) => ({ ...prev, eventId }));
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
          value={state.rootDir}
          onChange={(e) => {
            const rootDir = e.currentTarget.value;
            setState((state) => ({ ...state, rootDir }));
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
          name="builder"
          id="builder"
          value={builder}
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
            name="dockerfilePath"
            id="dockerfilePath"
            placeholder="Dockerfile"
            value={state.dockerfilePath}
            onChange={(e) => {
              const dockerfilePath = e.currentTarget.value;
              setState((state) => ({ ...state, dockerfilePath }));
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
