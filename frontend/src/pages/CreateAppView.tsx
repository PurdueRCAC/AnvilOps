import { EnvVarGrid } from "@/components/EnvVarGrid";
import { ImportRepoDialog } from "@/components/ImportRepoDialog";
import { MountsGrid, type Mounts } from "@/components/MountsGrid";
import { Button } from "@/components/ui/button";
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
import { UserContext } from "@/components/UserProvider";
import type { components } from "@/generated/openapi";
import { api } from "@/lib/api";
import { useDebouncedValue } from "@/lib/utils";
import clsx from "clsx";
import {
  BookMarked,
  Cable,
  Check,
  Code2,
  Component,
  Container,
  Database,
  FolderRoot,
  GitBranch,
  Globe,
  Hammer,
  Link,
  Loader,
  Rocket,
  Server,
  Tag,
  X,
} from "lucide-react";
import { useContext, useEffect, useMemo, useState, type Dispatch } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

export default function CreateAppView() {
  const { user } = useContext(UserContext);

  const { mutateAsync: createApp, isPending: createPending } = api.useMutation(
    "post",
    "/app",
  );

  const [search] = useSearchParams();

  const [formState, setFormState] = useState<AppInfoFormData>({
    groupOption: "standalone",
    env: [{ name: "", value: "", isSensitive: false }],
    mounts: [{ path: "", amountInMiB: 1024 }],
    orgId: search.has("org")
      ? parseInt(search.get("org")!.toString())
      : user?.orgs?.[0]?.id,
    repositoryId: search.has("repo")
      ? parseInt(search.get("repo")!.toString())
      : undefined,
    source: "git",
    builder: "railpack",
    dockerfilePath: "Dockerfile",
    rootDir: "./",
    subdomain: "",
  });

  const navigate = useNavigate();

  const shouldShowDeploy = useMemo(() => {
    return (
      formState.orgId === undefined ||
      user?.orgs.some(
        (org) => org.id === formState.orgId && org.githubConnected,
      )
    );
  }, [user, formState.orgId]);

  return (
    <div className="flex max-w-prose mx-auto">
      <form
        className="flex flex-col gap-6 w-full my-10"
        onSubmit={async (e) => {
          e.preventDefault();
          const formData = new FormData(e.currentTarget);

          let appName = "untitled";
          if (formState.source === "git") {
            appName = formState.repoName!;
          } else if (formState.source === "image") {
            const tag = formState.imageTag!.split("/");
            appName = tag[tag.length - 1].split(":")[0];
          }
          try {
            let appGroup: components["schemas"]["NewApp"]["appGroup"];
            switch (formState.groupOption) {
              case "standalone":
                appGroup = { type: "standalone" };
                break;
              case "create-new":
                appGroup = {
                  type: "create-new",
                  name: formData.get("groupName")!.toString(),
                };
                break;
              default:
                appGroup = { type: "add-to", id: formState.groupId! };
                break;
            }
            const result = await createApp({
              body: {
                source: formState.source,
                orgId: formState.orgId!,
                name: appName,
                appGroup,
                repositoryId: formState.repositoryId ?? null,
                dockerfilePath: formState.dockerfilePath ?? null,
                rootDir: formState.rootDir ?? null,
                branch: formState.branch ?? null,
                builder: formState.builder,
                imageTag: formState.imageTag ?? null,
                subdomain: formState.subdomain!,
                port: parseInt(formState.port!),
                env: formState.env.filter((ev) => ev.name.length > 0),
                mounts: formState.mounts.filter((m) => m.path.length > 0),
              },
            });

            navigate(`/app/${result.id}`);
          } catch (err) {
            toast.error((err as Error).message);
          }
        }}
      >
        <h2 className="font-bold text-3xl mb-4">Create an App</h2>
        <div className="space-y-2">
          <div className="flex items-baseline gap-2">
            <Label htmlFor="selectOrg" className="pb-1">
              <Globe className="inline" size={16} />
              Organization
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
            onValueChange={(orgId) =>
              setFormState({ ...formState, orgId: parseInt(orgId!) })
            }
            value={formState.orgId?.toString()}
            name="org"
          >
            <SelectTrigger className="w-full" id="selectOrg">
              <SelectValue placeholder="Select an organization" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {user?.orgs?.map((org) => (
                  <SelectItem key={org.id} value={org.id.toString()}>
                    {org.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <AppConfigFormFields state={formState} setState={setFormState} />
        {shouldShowDeploy ? (
          <Button className="mt-8" size="lg" type="submit">
            {createPending ? (
              <>
                <Loader className="animate-spin" /> Deploying...
              </>
            ) : (
              <>
                <Rocket />
                Deploy
              </>
            )}
          </Button>
        ) : null}
      </form>
    </div>
  );
}

export const GitHubIcon = ({ className }: { className?: string }) => (
  <svg
    role="img"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
    fill="currentColor"
    className={className}
  >
    <title>GitHub</title>
    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
  </svg>
);

type Env = { name: string; value: string | null; isSensitive: boolean }[];
export type NonNullableEnv = {
  name: string;
  value: string;
  isSensitive: boolean;
}[];

export type AppInfoFormData = {
  name?: string;
  port?: string;
  subdomain: string;
  dockerfilePath?: string;
  groupOption?: string;
  groupId?: number;
  env: Env;
  mounts: Mounts;
  orgId?: number;
  repositoryId?: number;
  repoName?: string;
  imageTag?: string;
  branch?: string;
  rootDir?: string;
  source: "git" | "image";
  builder: "dockerfile" | "railpack";
};

export const AppConfigFormFields = ({
  state,
  setState,
  hideSubdomainInput,
  hideGroupSelect,
  defaults,
}: {
  state: AppInfoFormData;
  setState: Dispatch<React.SetStateAction<AppInfoFormData>>;
  hideSubdomainInput?: boolean;
  hideGroupSelect?: boolean;
  defaults?: {
    config?: components["schemas"]["DeploymentConfig"];
  };
}) => {
  const {
    groupOption,
    groupId,
    source,
    builder,
    env,
    mounts,
    orgId,
    repositoryId,
    subdomain,
  } = state;

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
        orgId !== undefined && selectedOrg?.githubConnected && source === "git",
    },
  );

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

  useEffect(() => {
    setState({
      ...state,
      branch: branches?.default ?? branches?.branches?.[0],
    });
  }, [branches]);

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

  const [importDialogShown, setImportDialogShown] = useState(false);
  const [groupName, setGroupName] = useState("");
  const isGroupNameValid = useMemo(() => {
    const MAX_GROUP_LENGTH = 56;
    return (
      groupName.length <= MAX_GROUP_LENGTH &&
      groupName.match(/^[a-zA-Z0-9][ a-zA-Z0-9-_\.]*$/)
    );
  }, [groupName]);

  if (selectedOrg !== undefined && !selectedOrg?.githubConnected) {
    return selectedOrg?.permissionLevel === "OWNER" ? (
      <>
        <p className="mt-4">
          <strong>{selectedOrg?.name}</strong> has not been connected to GitHub.
        </p>
        <p className="mb-4">
          AnvilOps integrates with GitHub to deploy your app as soon as you push
          to your repository.
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
      </>
    ) : (
      <>
        <p className="my-4">
          <strong>{selectedOrg?.name}</strong> has not been connected to GitHub.
          Ask the owner of your organization to install the AnvilOps GitHub App.
        </p>
      </>
    );
  }

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
            setState({
              ...state,
              repositoryId,
              repoName,
            })
          }
        />
      )}
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
              disabled={orgId === undefined || groupsLoading}
              onValueChange={(groupOption) => {
                const groupId = parseInt(groupOption);
                if (isNaN(groupId)) {
                  setState({
                    ...state,
                    groupOption: groupOption,
                    groupId: undefined,
                  });
                } else {
                  setState({ ...state, groupOption: "add-to", groupId });
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
        <>
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
                    repositoryId:
                      typeof repo === "string" ? parseInt(repo) : repo,
                    repoName: repos?.find((r) => r?.id === parseInt(repo))
                      ?.name,
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
                  (repositoryId === undefined || branchesLoading) &&
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
            <Select
              required
              name="branch"
              disabled={repositoryId === undefined || branchesLoading}
              value={state.branch ?? ""}
              onValueChange={(branch) => {
                setState({ ...state, branch });
              }}
            >
              <SelectTrigger className="w-full" id="selectBranch">
                <SelectValue placeholder="Select a branch" />
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
        </>
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

      {source === "git" && (
        <>
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
                  Detects your project structure and builds your app
                  automatically.
                </p>
              </Label>
            </RadioGroup>
          </div>
          {builder === "dockerfile" ? (
            <div>
              <Label className="pb-1 mb-2" htmlFor="dockerfilePath">
                <Container className="inline" size={16} /> Dockerfile Path
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
      )}

      <h3 className="mt-4 font-bold pb-1 border-b">Deployment Options</h3>

      {!hideSubdomainInput && (
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
            <span className="absolute left-2 text-sm opacity-50">https://</span>
            <Input
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
              .anvilops.rcac.purdue.edu
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
              <SubdomainStatus available={subStatus!.available} />
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
      <div className="space-y-2">
        <Label className="pb-1">
          <Code2 className="inline" size={16} /> Environment Variables
        </Label>
        <EnvVarGrid
          value={env}
          setValue={(env) => {
            setState((prev) => ({ ...prev, env }));
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
        />
      </div>
      <div className="space-y-2">
        <Label className="pb-1">
          <Database className="inline" size={16} /> Volume Mounts
        </Label>
        <p className="opacity-50 text-sm">
          Preserve files contained at these paths across app restarts. All other
          files will be discarded. Every replica will get its own separate
          volume.
        </p>
        <MountsGrid
          value={mounts}
          setValue={(mounts) => setState((prev) => ({ ...prev, mounts }))}
        />
      </div>
    </>
  );
};

export const SubdomainStatus = ({ available }: { available: boolean }) => {
  return available ? (
    <span className="text-green-500 text-sm">
      <Check className="inline" /> Subdomain is available.
    </span>
  ) : (
    <span className="text-red-500 text-sm">
      <X className="inline" /> Subdomain is in use.
    </span>
  );
};
