import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { UserContext } from "@/components/UserProvider";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Container, GitCommit, Loader, Rocket } from "lucide-react";
import { useContext, useEffect, useRef, useState, type Dispatch } from "react";
import { toast } from "sonner";
import type { App } from "../AppView";
import { AppConfigDiff, type DeploymentConfigFormData } from "./AppConfigDiff";

const defaultRedeployState = {
  radioValue: undefined,
  configOpen: false,
  configState: {
    replicas: "",
    env: [],
    source: "git" as const,
    builder: "dockerfile" as const,
    port: "",
    cpuCores: "1",
    memoryInMiB: 1024,
    createIngress: true,
    collectLogs: true,
  } satisfies DeploymentConfigFormData,
  enableCD: true,
  idx: 0,
};

Object.freeze(defaultRedeployState);

export const RedeployModal = ({
  isOpen,
  setOpen,
  app,
  deploymentId,
  onSubmitted,
}: {
  isOpen: boolean;
  setOpen: Dispatch<boolean>;
  app: App;
  deploymentId: number;
  onSubmitted: () => void;
}) => {
  const { mutateAsync: updateApp, isPending: isUpdatingApp } = api.useMutation(
    "put",
    "/app/{appId}",
  );

  const [redeployState, setRedeployState] = useState<{
    radioValue: "useBuild" | "useConfig" | undefined;
    configOpen: boolean;
    configState: DeploymentConfigFormData;
    enableCD: boolean;
    idx: number;
  }>(defaultRedeployState);

  const resourceConfig = {
    cpu:
      Math.round(parseFloat(redeployState.configState.cpuCores) * 1000) + "m",
    memory: redeployState.configState.memoryInMiB + "Mi",
  };

  const { data: pastDeployment, isPending: pastDeploymentLoading } =
    api.useQuery(
      "get",
      "/app/{appId}/deployments/{deploymentId}",
      { params: { path: { appId: app.id, deploymentId: deploymentId! } } },
      { enabled: isOpen && !!deploymentId },
    );

  const setRadioValue = (value: string) => {
    if (pastDeployment === undefined) return; // Should never happen; sanity check to satisfy type checker

    // Populate the new deployment config based on the previous deployment
    setRedeployState((rs) => ({
      ...rs,
      radioValue: value as "useBuild" | "useConfig",
      configState: {
        orgId: app.orgId,
        port: pastDeployment.config.port.toString(),
        replicas: pastDeployment.config.replicas.toString(),
        env: pastDeployment.config.env,
        cpuCores: (
          parseInt(pastDeployment.config.limits?.cpu ?? "1000m") / 1000
        ).toString(), // convert millicores ("m") to cores,
        memoryInMiB: parseInt(pastDeployment.config.limits?.memory ?? "1024Mi"),
        createIngress: pastDeployment.config.createIngress,
        collectLogs: pastDeployment.config.collectLogs,
        ...(pastDeployment.config.source === "git"
          ? {
              source: "git",
              builder: pastDeployment.config.builder,
              event: pastDeployment.config.event,
              eventId: pastDeployment.config.eventId?.toString() ?? undefined,
              commitHash:
                value === "useBuild" ? pastDeployment.commitHash : undefined,
              dockerfilePath: pastDeployment.config.dockerfilePath ?? undefined,
              rootDir: pastDeployment.config.rootDir ?? undefined,
              repositoryId: pastDeployment.config.repositoryId,
              branch: pastDeployment.config.branch,
            }
          : {
              source: "image",
              imageTag: pastDeployment.config.imageTag,
            }),
      },
    }));
  };

  useEffect(() => {
    if (
      !pastDeploymentLoading &&
      pastDeployment &&
      redeployState.radioValue === undefined
    ) {
      setRadioValue("useBuild");
    }
  }, [pastDeployment, pastDeploymentLoading, isOpen]);

  useEffect(() => {
    // Clear inputs when closing the dialog
    if (!isOpen) {
      setRedeployState(defaultRedeployState);
    }
  }, [isOpen]);

  const { user } = useContext(UserContext);
  const selectedOrg = user?.orgs?.find((org) => org.id === app.orgId);

  const form = useRef<HTMLFormElement | null>(null);

  if (!deploymentId) return null;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (open === false && redeployState.configOpen) {
          setRedeployState((s) => ({ ...s, configOpen: false }));
        } else {
          setOpen(open);
        }
      }}
    >
      <DialogContent
        className={cn(
          "duration-300",
          redeployState.configOpen &&
            "h-fit max-h-5/6 2xl:max-h-2/3 flex flex-col overflow-auto sm:max-w-4xl",
        )}
      >
        <DialogHeader>
          <DialogTitle>Reuse This Deployment</DialogTitle>
        </DialogHeader>
        {pastDeploymentLoading || pastDeployment === undefined ? (
          <div className="flex gap-2 items-center">
            <Loader className="animate-spin" /> Setting up...
          </div>
        ) : (
          <form
            ref={form}
            className="space-y-1"
            onSubmit={async (e) => {
              e.preventDefault();
              const config = redeployState.configState;
              const res = {
                replicas: parseInt(config.replicas),
                port: parseInt(config.port),
                env: config.env.filter((env) => env.name.length > 0),
                mounts: app.config.mounts,
                limits: resourceConfig,
                requests: resourceConfig,
                createIngress: config.createIngress === true,
                collectLogs: config.collectLogs === true,
                ...(config.source === "git"
                  ? {
                      source: "git" as const,
                      repositoryId: config.repositoryId!,
                      rootDir: config.rootDir!,
                      branch: config.branch,
                      event: config.event!,
                      eventId: config.eventId ? parseInt(config.eventId) : null,
                      commitHash: config.commitHash,
                      builder: config.builder!,
                      dockerfilePath: config.dockerfilePath! ?? "",
                    }
                  : {
                      source: "image" as const,
                      imageTag: config.imageTag!,
                    }),
              };

              await updateApp({
                params: { path: { appId: app.id } },
                body: {
                  enableCD: redeployState.enableCD,
                  config: res,
                },
              });
              toast.success("App updated successfully!");
              onSubmitted();
              setOpen(false);
            }}
          >
            {!redeployState.configOpen ? (
              <>
                <p className="mt-2">
                  <strong>Step 1</strong>: Choose a starting point
                </p>
                <RadioGroup
                  required
                  className="mt-4"
                  value={redeployState.radioValue ?? ""}
                  onValueChange={(value) => {
                    setRadioValue(value);
                  }}
                >
                  <Label className="flex-col items-start">
                    <div className="flex gap-2">
                      <RadioGroupItem
                        value="useBuild"
                        className="whitespace-nowrap"
                      />
                      Redeploy from this{" "}
                      {pastDeployment.config.source === "git"
                        ? "commit"
                        : "image"}{" "}
                      with your current configuration:
                    </div>
                    <div className="mt-2 mb-2 ml-6">
                      {pastDeployment.config.source === "git" ? (
                        <a
                          href={`${pastDeployment.repositoryURL}/commit/${pastDeployment.commitHash}`}
                          className="flex items-start gap-2"
                          target="_blank"
                        >
                          <span className="text-black-2 flex items-center gap-1 -mt-1">
                            <GitCommit className="shrink-0" />
                            {pastDeployment.commitHash?.substring(0, 7) ??
                              "Unknown"}
                          </span>
                          {pastDeployment.commitMessage}
                        </a>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger>
                            <p className="flex items-center gap-2">
                              <Container className="text-black-2" />{" "}
                              <span className="max-w-96 whitespace-nowrap text-ellipsis overflow-x-clip">
                                {pastDeployment.config.imageTag}
                              </span>
                            </p>
                          </TooltipTrigger>
                          <TooltipContent>
                            {pastDeployment.config.imageTag}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                    <p className="text-black-3 ml-6 text-sm mb-4">
                      AnvilOps will combine this version of your application
                      with your latest configuration, so that you can roll back
                      your application while keeping your new settings.
                    </p>
                  </Label>
                  <Label className="flex-col items-start">
                    <div className="flex gap-2">
                      <RadioGroupItem value="useConfig" />
                      Reuse this deployment's configuration
                    </div>
                    <p className="text-black-3 ml-6 text-sm mb-4">
                      AnvilOps will create a new deployment using this
                      deployment's configuration as a template, plus any edits
                      you decide to make.
                    </p>
                  </Label>
                </RadioGroup>
                <p className="my-4">
                  <strong>Step 2</strong>: Make changes to the template as
                  needed
                </p>
                <Button
                  variant="outline"
                  className="w-full mb-2"
                  type="button"
                  onClick={() =>
                    setRedeployState((s) => ({ ...s, configOpen: true }))
                  }
                >
                  Review deployment configuration
                </Button>
                <p className="my-4">
                  <strong>Step 3</strong>: Toggle continuous deployment
                </p>
                <Label>
                  <Switch
                    checked={redeployState.enableCD}
                    onCheckedChange={(checked) =>
                      setRedeployState((rs) => ({ ...rs, enableCD: checked }))
                    }
                  />
                  <span>
                    Continuous deployment will be turned{" "}
                    <strong>{redeployState.enableCD ? "on." : "off."}</strong>
                  </span>
                </Label>
                <p className="text-black-4 text-sm my-2">
                  {redeployState.enableCD ? (
                    <>
                      If this app is linked to a Git repository and a commit is
                      pushed, the app may be rebuilt and redeployed
                      automatically.{" "}
                      {redeployState.radioValue === "useBuild" &&
                        redeployState.configState.source === "git" && (
                          <>
                            AnvilOps will{" "}
                            <strong>run this newer version of your app,</strong>{" "}
                            instead of the selected commit.
                          </>
                        )}
                    </>
                  ) : (
                    <>
                      If this app is linked to a Git repository, this app{" "}
                      <strong>will not be updated</strong> on the cluster in
                      response to repository events until continuous deployment
                      is re-enabled.
                    </>
                  )}
                </p>
                <Button
                  type="submit"
                  className="w-full mt-4"
                  disabled={isUpdatingApp}
                >
                  {isUpdatingApp ? (
                    <>
                      <Loader className="animate-spin" />
                      Deploying...
                    </>
                  ) : (
                    <>
                      <Rocket className="inline" />
                      Deploy
                    </>
                  )}
                </Button>
              </>
            ) : (
              <>
                <AppConfigDiff
                  orgId={app.orgId}
                  base={{
                    ...app.config,
                    replicas: app.config.replicas.toString(),
                    port: app.config.port.toString(),
                    cpuCores: (
                      parseInt(app.config.limits?.cpu ?? "1000m") / 1000
                    ).toString(), // convert millicores ("m") to cores,
                    memoryInMiB: parseInt(
                      app.config.limits?.memory ?? "1024Mi",
                    ),
                    ...(app.config.source === "git"
                      ? {
                          builder: app.config.builder,
                          eventId: app.config.eventId?.toString() ?? undefined,
                          dockerfilePath:
                            app.config.dockerfilePath ?? undefined,
                          rootDir: app.config.rootDir ?? undefined,
                        }
                      : {
                          builder: "dockerfile",
                          eventId: undefined,
                          dockerfilePath: undefined,
                          rootDir: undefined,
                        }),
                  }}
                  state={redeployState.configState}
                  setState={(
                    updateConfig: (
                      s: DeploymentConfigFormData,
                    ) => DeploymentConfigFormData,
                  ) => {
                    setRedeployState((rs) => ({
                      ...rs,
                      configState: updateConfig(rs.configState),
                    }));
                  }}
                  defaults={{ config: pastDeployment?.config }}
                />
                {(redeployState.configState.source !== "git" ||
                  selectedOrg?.githubConnected) && (
                  <Button
                    className="mt-4 float-right"
                    type="button"
                    onClick={() => {
                      if (form.current!.checkValidity()) {
                        setRedeployState((rs) => ({
                          ...rs,
                          configOpen: false,
                        }));
                      } else {
                        form.current!.reportValidity();
                      }
                    }}
                  >
                    Use this configuration
                  </Button>
                )}
              </>
            )}
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};
