import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserContext } from "@/components/UserProvider";
import type { components } from "@/generated/openapi";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from "@/components/ui/select";
import {
  Cable,
  Tag,
  Code2,
  Server,
  Cog,
  Terminal,
  Minimize,
  MoveRight,
  Scale3D,
} from "lucide-react";
import { useContext } from "react";
import { GitHubIcon } from "../../create-app/CreateAppView";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { EnvsWithDiffs } from "./EnvsWithDiffs";
import { GitConfigDiff } from "./GitConfigDiff";
export type DeploymentConfigFormData = {
  port: string;
  replicas: string;
  dockerfilePath?: string;
  env: Env;
  orgId?: number;
  repositoryId?: number;
  event?: "push" | "workflow_run";
  eventId?: string;
  imageTag?: string;
  branch?: string;
  rootDir?: string;
  source: "git" | "image";
  builder: "dockerfile" | "railpack";
  postStart?: string;
  preStop?: string;
};
type Env = { name: string; value: string | null; isSensitive: boolean }[];

export const AppConfigDiff = ({
  orgId,
  base,
  state,
  setState,
  defaults,
}: {
  orgId: number;
  base: DeploymentConfigFormData;
  state: DeploymentConfigFormData;
  setState: (
    callback: (state: DeploymentConfigFormData) => DeploymentConfigFormData,
  ) => void;
  defaults?: {
    config?: components["schemas"]["DeploymentConfig"];
  };
}) => {
  const { user } = useContext(UserContext);

  const selectedOrg = orgId
    ? user?.orgs?.find((it) => it.id === state.orgId)
    : undefined;

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
      <div className="flex items-baseline gap-2 mb-2">
        <Label className="pb-1">
          <Scale3D className="inline" size={16} /> Replicas
        </Label>
        <span
          className="text-red-500 cursor-default"
          title="This field is required."
        >
          *
        </span>
      </div>
      <div className="flex items-center gap-8">
        <Input
          type="number"
          disabled
          required
          className={cn(
            "w-full italic",
            base.replicas !== state.replicas && "bg-red-200",
          )}
          value={base.replicas}
        />
        <div>
          <MoveRight />
        </div>
        <Input
          name="replicas"
          type="number"
          required
          className={cn(
            "w-full",
            base.replicas !== state.replicas && "bg-green-50",
          )}
          value={state.replicas}
          onChange={(e) => {
            const replicas = e.currentTarget.value;
            setState((s) => ({ ...s, replicas }));
          }}
        />
      </div>
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
        <div className="flex items-center gap-8">
          <Select disabled={true} value={base.source}>
            <SelectTrigger
              className={cn(
                "w-full",
                base.source !== state.source && "bg-red-200",
              )}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="git">Git Repository</SelectItem>
              <SelectItem value="image">OCI Image</SelectItem>
            </SelectContent>
          </Select>
          <div>
            <MoveRight className="text-black-4" />
          </div>
          <Select
            required
            value={state.source}
            onValueChange={(source) =>
              setState((prev) => ({
                ...prev,
                source: source as "git" | "image",
              }))
            }
            name="source"
          >
            <SelectTrigger
              className={cn(
                "w-full",
                base.source !== state.source && "bg-green-50",
              )}
              id="deploymentSource"
            >
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
      </div>
      {state.source === "git" ? (
        <GitConfigDiff
          orgId={orgId}
          base={base}
          state={state}
          setState={setState}
        />
      ) : state.source === "image" ? (
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
            <div className="flex items-center justify-around gap-8">
              {base.source === "image" && (
                <>
                  <Input
                    className={cn(
                      "w-full italic",
                      base.imageTag !== state.imageTag && "bg-red-200",
                    )}
                    value={base.imageTag}
                    disabled
                  />
                  <div>
                    <MoveRight className="text-black-4" />
                  </div>
                </>
              )}
              <Input
                className={cn(
                  "w-full",
                  base.source === state.source &&
                    base.imageTag !== state.imageTag &&
                    "bg-green-50",
                )}
                value={state.imageTag ?? ""}
                onChange={(e) => {
                  const imageTag = e.currentTarget.value;
                  setState((state) => ({ ...state, imageTag }));
                }}
                name="imageTag"
                id="imageTag"
                placeholder="nginx:latest"
                // Docker image name format: https://pkg.go.dev/github.com/distribution/reference#pkg-overview
                // Regex: https://stackoverflow.com/a/39672069
                pattern="^(?:(?=[^:\/]{4,253})(?!-)[a-zA-Z0-9\-]{1,63}(?<!-)(?:\.(?!-)[a-zA-Z0-9\-]{1,63}(?<!-))*(?::[0-9]{1,5})?\/)?((?![._\-])(?:[a-z0-9._\-]*)(?<![._\-])(?:\/(?![._\-])[a-z0-9._\-]*(?<![._\-]))*)(?::(?![.\-])[a-zA-Z0-9_.\-]{1,128})?$"
                required
              />
            </div>
          </div>
        </>
      ) : null}

      <h3 className="mt-4 font-bold pb-1 border-b">Deployment Options</h3>
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
        <div className="flex items-center justify-around gap-8">
          <Input
            className={cn("w-full", base.port !== state.port && "bg-red-200")}
            value={base.port}
            disabled
          />
          <div>
            <MoveRight className="text-black-4" />
          </div>
          <Input
            name="portNumber"
            id="portNumber"
            placeholder="3000"
            className={cn("w-full", base.port !== state.port && "bg-green-50")}
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
      </div>
      <Accordion type="single" collapsible>
        <AccordionItem value="env">
          <AccordionTrigger>
            <Label className="pb-1">
              <Code2 className="inline" size={16} /> Environment Variables
            </Label>
          </AccordionTrigger>
          <AccordionContent>
            <EnvsWithDiffs
              base={base.env}
              value={state.env}
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
            />
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="advanced">
          <AccordionTrigger>
            <Label className="pb-1">
              <Cog className="inline" size={16} /> Advanced
            </Label>
          </AccordionTrigger>
          <AccordionContent className="space-y-10">
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
              <div className="flex items-center justify-around gap-8">
                <Input
                  className={cn(
                    "w-full italic",
                    // One of the fields is not empty, and they are not equal.
                    (base.postStart || state.postStart) &&
                      base.postStart !== state.postStart &&
                      "bg-red-200",
                  )}
                  value={base.postStart ?? "(No command specified)"}
                  disabled
                />
                <div>
                  <MoveRight className="text-black-4" />
                </div>
                <Input
                  name="postStart"
                  id="postStart"
                  placeholder="echo Hello World"
                  className={cn(
                    "w-full",
                    (base.postStart || state.postStart) &&
                      base.postStart !== state.postStart &&
                      "bg-green-50",
                  )}
                  value={state.postStart ?? ""}
                  onChange={(e) => {
                    const postStart = e.currentTarget.value;
                    setState((state) => ({ ...state, postStart }));
                  }}
                />
              </div>
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
              <div className="flex items-center justify-around gap-8">
                <Input
                  className="w-full italic"
                  value={base.preStop ?? "(No command specified)"}
                  disabled
                />
                <div>
                  <MoveRight className="text-black-4" />
                </div>
                <Input
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
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </>
  );
};
