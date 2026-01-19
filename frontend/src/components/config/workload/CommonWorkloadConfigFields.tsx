import { useAppConfig } from "@/components/AppConfigProvider";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { components } from "@/generated/openapi";
import { api } from "@/lib/api";
import { MAX_SUBDOMAIN_LENGTH, getAppName } from "@/lib/form";
import type { CommonFormFields, WorkloadUpdate } from "@/lib/form.types";
import { useDebouncedValue } from "@/lib/utils";
import { FormContext, NameStatus } from "@/pages/create-app/CreateAppView";
import {
  Code2,
  Cog,
  Cpu,
  Database,
  Link,
  Loader,
  Logs,
  MemoryStick,
  Server,
  X,
} from "lucide-react";
import { useContext, useEffect, useState } from "react";
import { EnvVarGrid } from "./EnvVarGrid";
import { MountsGrid } from "./MountsGrid";

export const CommonWorkloadConfigFields = ({
  appState,
  setState,
  disabled,
  originalConfig,
}: {
  appState: CommonFormFields;
  setState: (update: WorkloadUpdate) => void;
  disabled?: boolean;
  originalConfig?: components["schemas"]["DeploymentConfig"];
}) => {
  const appConfig = useAppConfig();
  const appDomain = URL.parse(appConfig?.appDomain ?? "");

  const state = appState.workload;
  const {
    port,
    env,
    mounts,
    subdomain,
    createIngress,
    cpuCores,
    memoryInMiB,
    collectLogs,
    namespace,
  } = state;

  const showSubdomainError =
    !!subdomain &&
    (subdomain.length > MAX_SUBDOMAIN_LENGTH ||
      subdomain.match(/^[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?$/) === null);

  const MAX_NAMESPACE_LEN = 63;
  const showNamespaceError =
    !!namespace &&
    (namespace.length > MAX_NAMESPACE_LEN ||
      namespace.match(/^[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?$/) === null);

  const context = useContext(FormContext);
  const isExistingApp = context === "UpdateApp" && !!originalConfig;

  const originalSubdomain =
    isExistingApp && originalConfig?.appType === "workload"
      ? originalConfig.subdomain
      : undefined;
  const debouncedSub = useDebouncedValue(subdomain);
  const debouncedNamespace = useDebouncedValue(namespace);

  const enableSubdomainCheck =
    !!subdomain &&
    subdomain === debouncedSub &&
    subdomain !== originalSubdomain &&
    !showSubdomainError;

  const enableNamespaceCheck =
    !!namespace && namespace === debouncedNamespace && !showNamespaceError;

  const { data: subStatus, isPending: subLoading } = api.useQuery(
    "get",
    "/app/subdomain",
    {
      params: {
        query: {
          subdomain: debouncedSub ?? "",
        },
      },
    },
    { enabled: enableSubdomainCheck },
  );

  const { data: namespaceStatus, isPending: namespaceLoading } = api.useQuery(
    "get",
    "/app/namespace",
    {
      params: {
        query: {
          namespace: debouncedNamespace ?? "",
        },
      },
    },
    { enabled: enableNamespaceCheck },
  );

  const [hasChangedNamespace, setHasChangedNamespace] = useState(false);

  useEffect(() => {
    if (!hasChangedNamespace) {
      setState((state) => ({
        ...state,
        namespace:
          getAppName(appState)
            .toLowerCase()
            .replaceAll(/[^a-zA-Z0-9-_]/g, "-") +
          "-" +
          Math.floor(Math.random() * 1_000_000),
      }));
    }
  }, [state.git.repositoryId, state.image.imageTag]);

  const fixedSensitiveNames =
    originalConfig?.appType === "workload"
      ? new Set(
          originalConfig.env
            .filter((env) => env.isSensitive)
            .map((env) => env.name),
        )
      : new Set<string>();

  return (
    <>
      <h3 className="mt-4 font-bold pb-1 border-b">Deployment Options</h3>
      {appDomain !== null && (
        <div className="space-y-2">
          <div className="flex items-baseline gap-2">
            <Label className="pb-1" htmlFor="subdomain">
              <Link className="inline" size={16} /> Public URL
            </Label>
            {createIngress && (
              <span
                className="text-red-500 h-fit cursor-default"
                title="This field is required."
              >
                *
              </span>
            )}
          </div>
          <Label>
            <Checkbox
              checked={createIngress}
              onCheckedChange={(checked) => {
                if (checked) {
                  setState({
                    createIngress: !!checked,
                  });
                } else {
                  setState({ createIngress: checked });
                }
              }}
            />
            <span className="text-sm">Make my app public</span>
          </Label>
          <div className="flex relative items-center gap-2">
            <span className="absolute left-2 text-sm opacity-50">
              {appDomain?.protocol}//
            </span>
            <Input
              disabled={disabled || !createIngress}
              required={createIngress}
              name="subdomain"
              id="subdomain"
              placeholder="my-app"
              className="w-full pl-14 pr-45"
              pattern="[A-Za-z0-9](?:[A-Za-z0-9\-]{0,61}[A-Za-z0-9])?"
              value={subdomain ?? ""}
              onChange={(e) => {
                const subdomain = e.currentTarget.value
                  .toLowerCase()
                  .replace(/[^a-z0-9-]/, "-");
                setState({ subdomain });
              }}
              autoComplete="off"
            />
            <span className="absolute right-2 text-sm opacity-50">
              .{appDomain?.host}
            </span>
          </div>
          {subdomain && showSubdomainError && (
            <div className="text-sm flex gap-5">
              <X className="text-red-500" />
              <ul className="text-black-3 list-disc">
                <li>
                  A subdomain must have {MAX_SUBDOMAIN_LENGTH} or fewer
                  characters.
                </li>
                <li>
                  A subdomain must only contain lowercase alphanumeric
                  characters or dashes(-).
                </li>
                <li>
                  A subdomain must start and end with an alphanumeric character.
                </li>
              </ul>
            </div>
          )}
          {subdomain &&
            !showSubdomainError &&
            subdomain !== originalSubdomain &&
            (subdomain !== debouncedSub || subLoading ? (
              <span className="text-sm">
                <Loader className="animate-spin inline" /> Checking subdomain...
              </span>
            ) : (
              <>
                <NameStatus
                  available={subStatus!.available}
                  resourceName="Subdomain"
                />
              </>
            ))}
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
          disabled={disabled}
          name="portNumber"
          id="portNumber"
          placeholder="3000"
          className="w-full"
          type="number"
          required
          min="1"
          max="65536"
          value={port ?? ""}
          onChange={(e) => {
            setState({ port: e.currentTarget.value });
          }}
        />
      </div>
      <div className="grid grid-cols-2 gap-y-2 gap-x-8">
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
        <div className="flex items-baseline gap-2">
          <Label className="pb-1" htmlFor="memory">
            <MemoryStick className="inline" size={16} /> Memory
          </Label>
          <span
            className="text-red-500 cursor-default"
            title="This field is required."
          >
            *
          </span>
        </div>
        <Input
          name="cpuCores"
          id="cpuCores"
          placeholder="0.5"
          className="w-full"
          type="number"
          required
          step=".001"
          min="0"
          value={cpuCores}
          onChange={(e) => {
            setState({ cpuCores: e.currentTarget.value });
          }}
        />
        <div className="flex items-center gap-2">
          <Input
            name="memory"
            id="memory"
            placeholder="1024"
            className="w-full"
            type="number"
            required
            min="1"
            value={memoryInMiB}
            onChange={(e) => {
              setState({ memoryInMiB: e.currentTarget.value });
            }}
          />
          MiB
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
            <EnvVarGrid
              value={env}
              setValue={(updater) => {
                setState((prev) => ({ ...prev, env: updater(prev.env) }));
              }}
              fixedSensitiveNames={fixedSensitiveNames}
              disabled={disabled ?? false}
            />
          </AccordionContent>
        </AccordionItem>
        {appConfig.storageEnabled && (
          <AccordionItem value="mounts">
            <AccordionTrigger>
              <Label className="pb-1">
                <Database className="inline" size={16} /> Volume Mounts
              </Label>
            </AccordionTrigger>
            <AccordionContent className="px-4">
              {!!isExistingApp && (
                <p className="col-span-full text-amber-600">
                  Volume mounts cannot be edited after an app has been created.
                </p>
              )}
              <p className="opacity-50 text-sm mb-4">
                Preserve files contained at these paths across app restarts. All
                other files will be discarded. Every replica will get its own
                separate volume.
              </p>
              <MountsGrid
                readonly={disabled || isExistingApp} // If we're in the Config tab of an existing application, mounts should not be editable. Kubernetes doesn't allow editing volumes after creating a StatefulSet, and we haven't implemented a workaround yet.
                value={mounts}
                setValue={(updater) => {
                  setState((prev) => ({
                    ...prev,
                    mounts: updater(prev.mounts),
                  }));
                }}
              />
            </AccordionContent>
          </AccordionItem>
        )}
        <AccordionItem value="advanced">
          <AccordionTrigger>
            <Label className="pb-1">
              <Cog className="inline" size={16} /> Advanced
            </Label>
          </AccordionTrigger>
          <AccordionContent className="space-y-10 px-4 mt-2">
            {isExistingApp && (
              <div className="space-y-2">
                <div>
                  <Label className="pb-1">
                    <Logs className="inline" size={16} /> Keep Historical Logs
                  </Label>
                  <p className="text-sm text-black-2">
                    When this setting is disabled, you will only be able to view
                    logs from the most recent, alive pod from your app's most
                    recent deployment.
                  </p>
                  <div className="flex items-center gap-2 mt-4">
                    <Checkbox
                      disabled={disabled}
                      name="collectLogs"
                      id="collectLogs"
                      checked={collectLogs}
                      onCheckedChange={(checked) => {
                        setState({
                          collectLogs: checked === true,
                        });
                      }}
                    />
                    <Label htmlFor="collectLogs">
                      Record application logs as they're produced
                    </Label>
                  </div>
                </div>
              </div>
            )}

            {!isExistingApp && (
              <div className="space-y-2">
                <div className="flex items-baseline gap-2">
                  <Label className="pb-1" htmlFor="portNumber">
                    <Server className="inline" size={16} /> Namespace
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
                  name="namespace"
                  id="namespace"
                  placeholder="my-app"
                  className="w-full"
                  required
                  value={namespace ?? ""}
                  onChange={(e) => {
                    setHasChangedNamespace(true);
                    setState({ namespace: e.currentTarget.value });
                  }}
                />
                {namespace && showNamespaceError && (
                  <div className="text-sm flex gap-5">
                    <X className="text-red-500" />
                    <ul className="text-black-3 list-disc">
                      <li>
                        A namespace must have between 1 and {MAX_NAMESPACE_LEN}{" "}
                        characters.
                      </li>
                      <li>
                        A subdomain must only contain lowercase alphanumeric
                        characters or dashes(-).
                      </li>
                      <li>
                        A subdomain must start and end with an alphanumeric
                        character.
                      </li>
                    </ul>
                  </div>
                )}
                {namespace &&
                  !showNamespaceError &&
                  (namespace !== debouncedNamespace || namespaceLoading ? (
                    <span className="text-sm">
                      <Loader className="animate-spin inline" /> Checking
                      namespace...
                    </span>
                  ) : (
                    <NameStatus
                      available={namespaceStatus!.available}
                      resourceName="Namespace"
                    />
                  ))}
              </div>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </>
  );
};
