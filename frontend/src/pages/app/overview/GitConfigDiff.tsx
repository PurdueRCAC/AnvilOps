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
import { UserContext } from "@/components/UserProvider";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  BookMarked,
  ClipboardCheck,
  CloudUpload,
  Container,
  FolderRoot,
  GitBranch,
  Hammer,
} from "lucide-react";
import { useContext } from "react";
import { type DeploymentConfigFormData } from "./AppConfigDiff";
import { DiffInput } from "./DiffInput";

export const GitConfigDiff = ({
  orgId,
  base,
  state,
  setState,
  disabled = false,
}: {
  orgId: number;
  base: DeploymentConfigFormData;
  state: DeploymentConfigFormData;
  setState: (
    callback: (s: DeploymentConfigFormData) => DeploymentConfigFormData,
  ) => void;
  disabled?: boolean;
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
        selectedOrg?.gitProvider !== null,
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
      enabled: !!orgId && !!state.repositoryId && state.source === "git",
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
          <DiffInput
            required
            name="repo"
            disabled={disabled || orgId === undefined || reposLoading}
            left={base.repositoryId?.toString() ?? ""}
            setRight={(repo) => {
              setState((prev) => ({
                ...prev,
                repositoryId: typeof repo === "string" ? parseInt(repo) : repo,
                repoName: repos?.find((r) => r?.id === parseInt(repo))?.name,
              }));
            }}
            right={state.repositoryId?.toString() ?? ""}
            select={(props) => (
              <Select disabled={disabled} {...props}>
                <SelectTrigger
                  {...props}
                  id={props.side === "after" ? "selectRepo" : undefined}
                >
                  <SelectValue placeholder={props.placeholder} />
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
                              <SelectItem
                                key={repo.id}
                                value={repo.id!.toString()}
                              >
                                {repo.owner}/{repo.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        ))
                      : null}
                  </SelectGroup>
                </SelectContent>
              </Select>
            )}
          />
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
          <DiffInput
            required
            name="branch"
            disabled={
              disabled || state.repositoryId === undefined || branchesLoading
            }
            left={base.branch ?? ""}
            right={state.branch ?? ""}
            setRight={(branch) => {
              setState((prev) => ({ ...prev, branch }));
            }}
            select={(props) => (
              <Select disabled={disabled} {...props}>
                <SelectTrigger
                  {...props}
                  id={props.side === "after" ? "selectBranch" : undefined}
                >
                  {props.side === "before" ? (
                    (base.branch ?? "(None)")
                  ) : (
                    <SelectValue
                      placeholder={
                        branchesLoading && state.repositoryId
                          ? "Loading..."
                          : "Select a branch"
                      }
                    />
                  )}
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
            )}
          />
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
          <DiffInput
            required
            disabled={disabled}
            name="deployOnEvent"
            left={base.event}
            right={state.event ?? ""}
            setRight={(event) => {
              setState((prev) => ({
                ...prev,
                event: event as "push" | "workflow_run",
              }));
            }}
            select={(props) => (
              <Select disabled={disabled} {...props}>
                <SelectTrigger
                  {...props}
                  id={props.side === "after" ? "deployOnEvent" : undefined}
                >
                  <SelectValue
                    placeholder={
                      props.side === "before" ? "(None)" : "Select an event"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="push">Push</SelectItem>
                  <SelectItem value="workflow_run">
                    Successful workflow run
                  </SelectItem>
                </SelectContent>
              </Select>
            )}
          />
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
            <DiffInput
              required
              name="workflow"
              disabled={
                disabled ||
                state.repositoryId === undefined ||
                branchesLoading ||
                workflows?.workflows?.length === 0
              }
              left={base.eventId?.toString() ?? ""}
              right={state.eventId?.toString() ?? ""}
              setRight={(eventId) => {
                setState((prev) => ({ ...prev, eventId }));
              }}
              select={(props) => (
                <Select disabled={disabled} {...props}>
                  <SelectTrigger
                    {...props}
                    id={props.side === "after" ? "selectWorkflow" : undefined}
                  >
                    <SelectValue
                      placeholder={
                        props.side === "before" &&
                        state.repositoryId !== base.repositoryId
                          ? "N/A"
                          : workflowsLoading || workflows!.workflows!.length > 0
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
              )}
            />
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
          <DiffInput
            disabled={disabled}
            left={base.rootDir}
            right={state.rootDir}
            setRight={(rootDir) => {
              setState((state) => ({ ...state, rootDir }));
            }}
            name="rootDir"
            id="rootDir"
            placeholder="./"
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
          disabled={disabled}
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
              base.source === "git" && base.builder !== state.builder
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
              base.source === "git" && base.builder !== state.builder
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
            <DiffInput
              disabled={disabled}
              name="dockerfilePath"
              id="dockerfilePath"
              placeholder="Dockerfile"
              left={base.dockerfilePath}
              right={state.dockerfilePath}
              setRight={(dockerfilePath) => {
                setState((state) => ({ ...state, dockerfilePath }));
              }}
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
