import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { components } from "@/generated/openapi";
import { api } from "@/lib/api";
import AppConfigFormFields, {
  type AppInfoFormData,
} from "@/pages/create-app/AppConfigFormFields";
import type { RefetchOptions } from "@tanstack/react-query";
import { Loader, Save, Scale3D, TextCursorInput } from "lucide-react";
import { useEffect, useState, type Dispatch } from "react";
import { toast } from "sonner";
import { Input } from "../../components/ui/input";
import { FormContext } from "../create-app/CreateAppView";
import type { App } from "./AppView";
import { InfoBox } from "./OverviewTab";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AppConfigDiff,
  type DeploymentConfigFormData,
} from "./overview/AppConfigDiff";

export const ConfigTab = ({
  app,
  tab,
  setTab,
  refetch,
}: {
  app: App;
  tab: string;
  setTab: Dispatch<string>;
  refetch: (options: RefetchOptions | undefined) => Promise<any>;
}) => {
  const [formState, setFormState] = useState<AppInfoFormData>({
    port: app.config.port.toString(),
    env: app.config.env,
    mounts: app.config.mounts.map((mount) => ({
      // (remove volumeClaimName because it's not stored in the app's deployment config)
      amountInMiB: mount.amountInMiB,
      path: mount.path,
    })),
    postStart: app.config.postStart,
    preStop: app.config.preStop,
    subdomain: "",
    orgId: app.orgId,
    groupOption: app.appGroup.standalone ? "standalone" : "add-to",
    groupId: app.appGroup.id,
    projectId: app.projectId,
    source: app.config.source,
    ...(app.config.source === "git"
      ? {
          repositoryId: app.config.repositoryId,
          branch: app.config.branch,
          event: app.config.event,
          eventId: app.config.eventId?.toString() ?? undefined,
          rootDir: app.config.rootDir ?? undefined,
          dockerfilePath: app.config.dockerfilePath ?? undefined,
          builder: app.config.builder,
        }
      : {
          dockerfilePath: "Dockerfile",
          builder: "railpack",
        }),
    imageTag: app.config.imageTag,
  });

  const { mutateAsync: updateApp, isPending: updatePending } = api.useMutation(
    "put",
    "/app/{appId}",
  );

  const {
    mutateAsync: updateAppConfigTemplate,
    isPending: updateConfigPending,
  } = api.useMutation("put", "/app/{appId}/template");

  const [revertOpen, setRevertOpen] = useState(false);
  return (
    <>
      {app.isPreviewing && (
        <>
          <RevertDialog
            open={revertOpen}
            setOpen={setRevertOpen}
            app={app}
            onRevert={() => {
              if (tab === "configuration") {
                setTab("overview");
              }
              refetch({});
            }}
          />
          <InfoBox type="neutral" title="This app is in preview mode.">
            <div className="space-y-2">
              <p>
                Preview mode allows you to try out a deployment configuration
                while maintaining your app's configuration template for
                convenient reverting.
              </p>
              <p>
                The preview configuration is shown below. To persist it, you can
                save it as the configuration template after reviewing the
                values.
              </p>
              <p>You can also revert to the template instead.</p>
              <Button onClick={() => setRevertOpen(true)}>
                Revert to Template
              </Button>
            </div>
          </InfoBox>
        </>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();

          const formData = new FormData(e.currentTarget);
          let appGroup: components["schemas"]["AppUpdate"]["appGroup"];
          switch (formState.groupOption) {
            case "standalone":
              appGroup = {
                type: "standalone",
              };
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
          await updateApp({
            params: { path: { appId: app.id } },
            body: {
              name: formData.get("name")!.toString(),
              appGroup,
              projectId: formState.projectId,
              config: {
                port: parseInt(formData.get("portNumber")!.toString()),
                env: formState.env.filter((it) => it.name.length > 0),
                mounts: formState.mounts.filter((it) => it.path.length > 0),
                postStart: formState.postStart,
                preStop: formState.preStop,
                replicas: parseInt(formData.get("replicas")!.toString()),
                ...(formState.source === "git"
                  ? {
                      source: "git",
                      repositoryId: formState.repositoryId!,
                      branch: formState.branch!,
                      rootDir: formState.rootDir!,
                      ...(formState.builder === "dockerfile"
                        ? {
                            builder: formState.builder,
                            dockerfilePath: formState.dockerfilePath!,
                          }
                        : {
                            builder: formState.builder,
                            dockerfilePath: null,
                          }),
                      ...(formState.event === "push"
                        ? {
                            event: "push",
                            eventId: null,
                          }
                        : {
                            event: formState.event!,
                            eventId: parseInt(formState.eventId!),
                          }),
                    }
                  : {
                      source: "image",
                      imageTag: formState.imageTag!,
                    }),
              },
            },
          });

          toast.success("App updated successfully!");
          if (tab === "configuration") {
            setTab("overview");
          }
          refetch({});
        }}
        className="flex flex-col gap-8"
      >
        <div>
          <div className="flex items-baseline gap-2 mb-2">
            <Label className="pb-1">
              <TextCursorInput className="inline" size={16} /> App Name
            </Label>
            <span
              className="text-red-500 cursor-default"
              title="This field is required."
            >
              *
            </span>
          </div>
          <Input
            name="name"
            required
            defaultValue={app.displayName}
            disabled={app.isPreviewing}
          />
        </div>
        <div>
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
          <Input
            name="replicas"
            placeholder="1"
            type="number"
            required
            defaultValue={app.config.replicas}
            disabled={app.isPreviewing}
          />
        </div>
        <FormContext value="UpdateApp">
          <AppConfigFormFields
            state={formState}
            setState={setFormState}
            defaults={{ config: app.config }}
            isExistingApp
            disabled={app.isPreviewing}
          />
        </FormContext>
        {!app.isPreviewing && (
          <Button className="mt-8 max-w-max" disabled={updatePending}>
            {updatePending ? (
              <>
                <Loader className="animate-spin" /> Saving...
              </>
            ) : (
              <>
                <Save /> Save
              </>
            )}
          </Button>
        )}
      </form>
      {app.isPreviewing && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();

            await updateAppConfigTemplate({
              params: { path: { appId: app.id } },
              body: {
                ...app.config,
              },
            });

            toast.success("App config template updated.");

            if (tab === "configuration") {
              setTab("overview");
            }
            refetch({});
          }}
        >
          <Button className="mt-8 max-w-max">
            {updateConfigPending ? (
              <>
                <Loader className="animate-spin" /> Saving...
              </>
            ) : (
              <>
                <Save /> Save as Configuration Template
              </>
            )}
          </Button>
        </form>
      )}
    </>
  );
};

const RevertDialog = ({
  open,
  setOpen,
  app,
  onRevert,
}: {
  open: boolean;
  setOpen: Dispatch<boolean>;
  app: App;
  onRevert: () => void;
}) => {
  const { data, isPending } = api.useSuspenseQuery(
    "get",
    "/app/{appId}/template",
    { params: { path: { appId: app.id } } },
  );

  const { mutateAsync: revert, isPending: reverting } = api.useMutation(
    "post",
    "/app/{appId}/template/revert",
  );

  const [configState, setConfigState] = useState<DeploymentConfigFormData>({
    replicas: "",
    env: [],
    source: "git" as const,
    builder: "dockerfile" as const,
    port: "",
  });

  useEffect(() => {
    const template = data?.config;
    if (!isPending && template) {
      setConfigState({
        orgId: app.orgId,
        port: template.port.toString(),
        replicas: template.replicas.toString(),
        env: template.env,
        ...(template.source === "git"
          ? {
              source: "git",
              builder: template.builder,
              event: template.event,
              eventId: template.eventId?.toString() ?? undefined,
              dockerfilePath: template.dockerfilePath ?? undefined,
              rootDir: template.rootDir ?? undefined,
              repositoryId: template.repositoryId,
              branch: template.branch,
            }
          : {
              source: "image",
              imageTag: template.imageTag,
            }),
      });
    }
  }, [data, isPending]);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="duration-300 h-fit max-h-5/6 2xl:max-h-2/3 flex flex-col overflow-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Revert to Template Configuration</DialogTitle>
        </DialogHeader>
        {isPending || data?.config === undefined ? (
          <div className="flex gap-2 items-center">
            <Loader className="animate-spin" /> Setting up...
          </div>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();

              await revert({
                params: { path: { appId: app.id } },
              });

              toast.success("App configuration reverted to template.");
              onRevert();
            }}
          >
            <AppConfigDiff
              orgId={app.orgId}
              base={{
                ...app.config,
                replicas: app.config.replicas.toString(),
                port: app.config.port.toString(),
                ...(app.config.source === "git"
                  ? {
                      builder: app.config.builder,
                      eventId: app.config.eventId?.toString() ?? undefined,
                      dockerfilePath: app.config.dockerfilePath ?? undefined,
                      rootDir: app.config.rootDir ?? undefined,
                    }
                  : {
                      builder: "dockerfile",
                      eventId: undefined,
                      dockerfilePath: undefined,
                      rootDir: undefined,
                    }),
              }}
              state={configState}
              setState={() => {}}
              disabled
              defaults={{ config: data?.config }}
            />
            <Button className="mt-4 float-right">
              {reverting ? (
                <>
                  <Loader className="animate-spin" /> Reverting...
                </>
              ) : (
                <>
                  <Save /> Revert
                </>
              )}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};
