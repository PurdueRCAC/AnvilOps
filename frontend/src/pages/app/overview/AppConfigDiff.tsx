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
import {
  Cable,
  Code2,
  Cog,
  Cpu,
  MemoryStick,
  Scale3D,
  Server,
  Tag,
  Terminal,
} from "lucide-react";
import { useContext } from "react";
import { GitHubIcon } from "../../create-app/CreateAppView";
import { DiffInput } from "./DiffInput";
import { EnvsWithDiffs } from "./EnvsWithDiffs";
import { GitConfigDiff } from "./GitConfigDiff";

export type DeploymentConfigFormData = {
  port: string;
  replicas: string;
  dockerfilePath?: string;
  env: Env;
  repositoryId?: number;
  event?: "push" | "workflow_run";
  eventId?: string;
  commitHash?: string;
  imageTag?: string;
  branch?: string;
  rootDir?: string;
  source: "git" | "image";
  builder?: "dockerfile" | "railpack";
  createIngress: boolean;
  collectLogs: boolean;
  cpuCores: string;
  memoryInMiB: number;
};

type Env = { name: string; value: string | null; isSensitive: boolean }[];

export const AppConfigDiff = ({
  orgId,
  base,
  state,
  setState,
  defaults,
  disabled = false,
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
  disabled?: boolean;
}) => {
  const { user } = useContext(UserContext);

  const selectedOrg = orgId
    ? user?.orgs?.find((it) => it.id === orgId)
    : undefined;

  const showDeploymentOptions =
    state.source !== "git" || selectedOrg?.githubConnected;

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
            disabled={disabled}
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
              <Select disabled={disabled} {...props}>
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
        selectedOrg?.githubConnected ? (
          <GitConfigDiff
            disabled={disabled}
            orgId={orgId}
            base={base}
            state={state}
            setState={setState}
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
                disabled={disabled}
                left={base.imageTag ?? "(None)"}
                right={state.imageTag ?? ""}
                setRight={(imageTag) => {
                  setState((state) => ({ ...state, imageTag }));
                }}
                name="imageTag"
                id="imageTag"
                placeholder="nginx:latest"
                required
              />
            </div>
          </div>
        </>
      ) : null}

      {showDeploymentOptions && (
        <>
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
                disabled={disabled}
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
              <Label className="pb-1" htmlFor="replicas">
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
                disabled={disabled}
                id="replicas"
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
          <div className="space-y-2">
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
            <div className="flex items-center justify-around gap-8">
              <DiffInput
                name="cpuCores"
                id="cpuCores"
                placeholder="0.5"
                type="number"
                required
                step=".001"
                min="0"
                left={base.cpuCores?.toString() ?? "1"}
                right={state.cpuCores ?? "1"}
                setRight={(cpuCores) => {
                  setState((state) => ({ ...state, cpuCores }));
                }}
              />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-baseline gap-2">
              <Label className="pb-1" htmlFor="memoryInMiB">
                <MemoryStick className="inline" size={16} /> Memory (MiB)
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
                name="memoryInMiB"
                id="memoryInMiB"
                placeholder="1024"
                type="number"
                required
                min="1"
                left={base.memoryInMiB?.toString() ?? "1024"}
                right={state.memoryInMiB?.toString() ?? "1024"}
                setRight={(memoryInMiB) => {
                  setState((state) => ({
                    ...state,
                    memoryInMiB: parseInt(memoryInMiB),
                  }));
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
                  disabled={disabled}
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
                    <Label className="pb-1" htmlFor="collectLogs">
                      <Terminal className="inline" size={16} /> Keep Historical
                      Logs
                    </Label>
                    <p className="text-sm text-black-2">
                      When this setting is disabled, you will only be able to
                      view logs from the most recent, alive pod from your app's
                      most recent deployment.
                    </p>
                  </div>
                  <div className="flex items-center justify-around gap-8">
                    <DiffInput
                      disabled={disabled}
                      name="collectLogs"
                      type="checkbox"
                      left={base.collectLogs ? "true" : "false"}
                      right={state.collectLogs ? "true" : "false"}
                      setRight={(collectLogs) => {
                        setState((state) => ({
                          ...state,
                          collectLogs: collectLogs === "true",
                        }));
                      }}
                      select={(props) => (
                        <Select disabled={disabled} {...props}>
                          <SelectTrigger
                            {...props}
                            id={
                              props.side === "after" ? "collectLogs" : undefined
                            }
                          >
                            <SelectValue placeholder={props.placeholder} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value="true">Enabled</SelectItem>
                              <SelectItem value="false">Disabled</SelectItem>
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </>
      )}
    </div>
  );
};
