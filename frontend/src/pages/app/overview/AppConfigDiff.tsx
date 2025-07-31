import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserContext } from "@/components/UserProvider";
import type { components } from "@/generated/openapi";
import { cn } from "@/lib/utils";
import {
  Cable,
  Code2,
  Cog,
  Minimize,
  Scale3D,
  Server,
  Tag,
  Terminal,
} from "lucide-react";
import { useContext } from "react";
import { GitHubIcon } from "../../create-app/CreateAppView";
import { EnvsWithDiffs } from "./EnvsWithDiffs";
import { GitConfigDiff } from "./GitConfigDiff";
import { DiffInput } from "./DiffInput";

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
  builder?: "dockerfile" | "railpack";
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
    <div className="flex flex-col gap-8">
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
          <DiffInput
            left={base.source}
            right={state.source}
            placeholder="Select deployment source"
            setRight={(source) =>
              setState((prev) => ({
                ...prev,
                source: source as "git" | "image",
              }))
            }
            select={(props) => (
              <Select {...props}>
                <SelectTrigger
                  {...props}
                  id={props.side === "after" ? "deploymentSource" : undefined}
                >
                  <SelectValue placeholder={props.placeholder} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="git">Git Repository</SelectItem>
                    <SelectItem value="image">OCI Image</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            )}
          />
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
              <DiffInput
                left={base.imageTag ?? "(None)"}
                right={state.imageTag ?? ""}
                setRight={(imageTag) => {
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
          <DiffInput
            name="portNumber"
            id="portNumber"
            placeholder="3000"
            type="number"
            required
            min="1"
            max="65536"
            left={base.port}
            right={state.port}
            setRight={(port) => {
              setState((state) => ({ ...state, port }));
            }}
          />
        </div>
      </div>
      <div className="space-y-2">
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
          <DiffInput
            name="replicas"
            type="number"
            required
            left={base.replicas}
            right={state.replicas}
            setRight={(replicas) => {
              setState((s) => ({ ...s, replicas }));
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
          <AccordionContent className="px-4">
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
          <AccordionContent className="space-y-10 px-4">
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
                <DiffInput
                  name="postStart"
                  id="postStart"
                  placeholder="(No command)"
                  left={base.postStart}
                  right={state.postStart ?? ""}
                  setRight={(postStart) => {
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
                <DiffInput
                  name="preStop"
                  id="preStop"
                  placeholder="(No command)"
                  className={cn(
                    "w-full",
                    (base.preStop || state.preStop) &&
                      base.preStop !== state.preStop &&
                      "bg-green-50",
                  )}
                  left={base.preStop}
                  right={state.preStop ?? ""}
                  setRight={(preStop) => {
                    setState((state) => ({ ...state, preStop }));
                  }}
                />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
};
