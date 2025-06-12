import { EnvVarGrid } from "@/components/EnvVarGrid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import clsx from "clsx";
import {
  BookMarked,
  Code2,
  Container,
  FolderRoot,
  GitBranch,
  Globe,
  Hammer,
  Link,
  Rocket,
  Server,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export default function CreateAppView() {
  const { data: orgs, isPending: orgsLoading } = api.useQuery("get", "/org/me");

  const [selectedOrgId, setSelectedOrg] = useState<string | undefined>(
    undefined,
  );
  const [selectedRepoId, setSelectedRepo] = useState<string | undefined>(
    undefined,
  );
  const [selectedBranch, setSelectedBranch] = useState<string | undefined>(
    undefined,
  );

  const [environmentVariables, setEnvironmentVariables] = useState<
    { key: string; value: string }[]
  >([{ key: "", value: "" }]);

  const [builder, setBuilder] = useState<"dockerfile" | "railpack">(
    "dockerfile",
  );

  const selectedOrg =
    selectedOrgId !== undefined
      ? orgs?.find((it) => it.id === parseInt(selectedOrgId))
      : undefined;

  const { data: repos, isPending: reposLoading } = api.useQuery(
    "get",
    "/org/{orgId}/repos",
    { params: { path: { orgId: parseInt(selectedOrgId!) } } },
    { enabled: selectedOrgId !== undefined && selectedOrg?.githubConnected },
  );

  const { data: branches, isPending: branchesLoading } = api.useQuery(
    "get",
    "/org/{orgId}/repos/{repoId}/branches",
    {
      params: {
        path: {
          orgId: parseInt(selectedOrgId!),
          repoId: parseInt(selectedRepoId!),
        },
      },
    },
    {
      enabled:
        selectedOrgId !== undefined &&
        selectedRepoId !== undefined &&
        selectedOrg?.githubConnected,
    },
  );

  const selectedRepo =
    selectedRepoId !== undefined
      ? repos?.find((it) => it.id === parseInt(selectedRepoId))
      : undefined;

  const { mutateAsync: createApp } = api.useMutation("post", "/app");

  const navigate = useNavigate();

  return (
    <div className="flex max-w-prose mx-auto">
      <form
        className="flex flex-col gap-4 w-full my-10"
        onSubmit={async (e) => {
          e.preventDefault();
          const formData = new FormData(e.currentTarget);
          const result = await createApp({
            body: {
              orgId: selectedOrg!.id,
              name: selectedRepo!.name!,
              port: parseInt(formData.get("port")!.toString()),
              subdomain: formData.get("subdomain")!.toString(),
              dockerfilePath: formData.get("dockerfilePath")?.toString(),
              env: environmentVariables.reduce(
                (acc, current) => {
                  if (current.key !== "") {
                    acc[current.key] = current.value;
                  }
                  return acc;
                },
                {} as Record<string, string>,
              ),
              repositoryId: selectedRepo!.id!,
              secrets: [
                /* TODO */
              ],
              branch: formData.get("branch")!.toString(),
              builder: formData.get("builder")!.toString() as
                | "dockerfile"
                | "railpack",
              rootDir: formData.get("rootDir")!.toString(),
            },
          });

          toast.success("App created!");

          navigate(`/app/${result.id}`);
        }}
      >
        <h2 className="font-bold text-3xl mb-4">Create a Project</h2>
        <div className="space-y-2">
          <Label htmlFor="selectOrg" className="pb-1">
            <Globe className="inline" size={16} />
            Organization
          </Label>
          <Select onValueChange={setSelectedOrg} name="org">
            <SelectTrigger
              className="w-full"
              onSelect={(e) => e}
              id="selectOrg"
            >
              <SelectValue
                placeholder={
                  orgsLoading ? "Loading..." : "Select an organization"
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {orgs?.map((org) => (
                  <SelectItem key={org.id} value={org.id.toString()}>
                    {org.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        {selectedOrg === undefined || selectedOrg.githubConnected ? (
          <>
            <div className="space-y-2">
              <Label
                htmlFor="selectRepo"
                className={clsx(
                  "pb-1",
                  (selectedOrgId === undefined || reposLoading) && "opacity-50",
                )}
              >
                <BookMarked className="inline" size={16} />
                Repository
              </Label>
              <Select
                name="repo"
                disabled={selectedOrgId === undefined || reposLoading}
                onValueChange={setSelectedRepo}
              >
                <SelectTrigger className="w-full peer" id="selectRepo">
                  <SelectValue
                    placeholder={
                      reposLoading && selectedOrgId !== undefined
                        ? "Loading..."
                        : "Select a repository"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {selectedOrgId !== undefined
                      ? repos?.map((repo) => (
                          <SelectItem key={repo.id} value={repo.id!.toString()}>
                            {repo.owner}/{repo.name}
                          </SelectItem>
                        ))
                      : null}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="selectBranch"
                className={clsx(
                  "pb-1",
                  (selectedRepoId === undefined || branchesLoading) &&
                    "opacity-50",
                )}
              >
                <GitBranch className="inline" size={16} />
                Branch
              </Label>
              <Select
                name="branch"
                disabled={selectedRepoId === undefined || branchesLoading}
                onValueChange={setSelectedBranch}
              >
                <SelectTrigger className="w-full" id="selectBranch">
                  <SelectValue
                    placeholder={
                      branchesLoading && selectedBranch !== undefined
                        ? "Loading..."
                        : "Select a branch"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {selectedRepoId !== undefined
                      ? branches?.branches?.map((branch) => (
                          <SelectItem key={branch} value={branch}>
                            {branch}
                          </SelectItem>
                        ))
                      : null}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="pb-1 mb-2">
                <FolderRoot className="inline" size={16} /> Root directory
              </Label>
              <Input
                name="rootDir"
                placeholder="./"
                className="w-full mb-1"
                pattern="^\.\/.*$"
              />
              <p className="opacity-50 text-xs">
                Must start with <code>./</code>
              </p>
            </div>

            <div className="space-y-2">
              <Label className="pb-1">
                <Link className="inline" size={16} /> Public URL
              </Label>
              <div className="flex relative items-center gap-2">
                <span className="absolute left-2 text-sm opacity-50">
                  https://
                </span>
                <Input
                  name="subdomain"
                  placeholder="my-app"
                  className="w-full pl-14 pr-45"
                  required
                  pattern="[A-Za-z0-9](?:[A-Za-z0-9\-]{0,61}[A-Za-z0-9])?"
                  onChange={(e) => {
                    e.currentTarget.value = e.currentTarget.value
                      .toLowerCase()
                      .replace(/[^A-Za-z0-9-]/, "-");
                  }}
                />
                <span className="absolute right-2 text-sm opacity-50">
                  .anvilops.rcac.purdue.edu
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="pb-1">
                <Server className="inline" size={16} /> Port Number
              </Label>
              <Input
                name="port"
                placeholder="3000"
                className="w-full"
                type="number"
                required
                min="1"
                max="65536"
              />
            </div>

            <div className="space-y-2">
              <Label className="pb-1">
                <Code2 className="inline" size={16} /> Environment Variables
              </Label>
              <EnvVarGrid
                value={environmentVariables}
                setValue={setEnvironmentVariables}
              />
            </div>

            <div className="space-y-2">
              <Label className="pb-1">
                <Hammer className="inline" size={16} /> Builder
              </Label>
              <RadioGroup
                name="builder"
                value={builder}
                onValueChange={(newValue) =>
                  setBuilder(newValue as "dockerfile" | "railpack")
                }
                required
              >
                <Label
                  htmlFor="builder-dockerfile"
                  className="flex items-center gap-2 border rounded-lg p-4 has-checked:bg-gray-100 hover:bg-gray-50"
                >
                  <RadioGroupItem value="dockerfile" id="builder-dockerfile" />
                  Dockerfile
                  <p className="opacity-50">
                    Builds your app using your Dockerfile.
                  </p>
                </Label>
                <Label
                  htmlFor="builder-railpack"
                  className="flex items-center gap-2 border rounded-lg p-4 has-checked:bg-gray-100 hover:bg-gray-50"
                >
                  <RadioGroupItem value="railpack" id="builder-railpack" />
                  Railpack
                  <p className="opacity-50">
                    Detects your project structure and builds your app
                    automatically.
                  </p>
                </Label>
              </RadioGroup>
            </div>

            {builder === "dockerfile" ? (
              <div>
                <Label className="pb-1 mb-2">
                  <Container className="inline" size={16} /> Dockerfile Path
                </Label>
                <Input
                  name="dockerfilePath"
                  placeholder="Dockerfile"
                  defaultValue="Dockerfile"
                  className="w-full"
                  required
                />{" "}
                <p className="opacity-50 text-xs mb-2 mt-1">
                  Relative to the root directory.
                </p>
              </div>
            ) : null}
            <Button
              className="mt-8"
              size="lg"
              type="submit"
              disabled={
                selectedBranch === undefined ||
                selectedRepoId === undefined ||
                selectedOrg === undefined
              }
            >
              <Rocket />
              Deploy
            </Button>
          </>
        ) : selectedOrg?.isOwner ? (
          <>
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
                <svg
                  role="img"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="currentColor"
                >
                  <title>GitHub</title>
                  <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
                </svg>
                Install GitHub App
              </Button>
            </a>
          </>
        ) : (
          <>
            <p className="my-4">
              <strong>{selectedOrg?.name}</strong> has not been connected to
              GitHub. Ask the owner of your organization to install the AnvilOps
              GitHub App.
            </p>
          </>
        )}
      </form>
    </div>
  );
}
