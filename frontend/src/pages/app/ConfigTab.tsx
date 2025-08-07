import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { components } from "@/generated/openapi";
import { api } from "@/lib/api";
import AppConfigFormFields, {
  type AppInfoFormData,
} from "@/pages/create-app/AppConfigFormFields";
import type { RefetchOptions } from "@tanstack/react-query";
import { Loader, Save, Scale3D, TextCursorInput } from "lucide-react";
import { useState, type Dispatch } from "react";
import { toast } from "sonner";
import { Input } from "../../components/ui/input";
import { FormContext } from "../create-app/CreateAppView";
import type { App } from "./AppView";
import HelpTooltip from "@/components/HelpTooltip";

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
    cpuCores: parseInt(app.config.limits?.cpu ?? "1000m") / 1000, // parseInt ignores the "m" which means millicore - we need to divide by 1000 to get the number of full cores
    memoryInMiB: parseInt(app.config.limits?.memory ?? "1024"), // parseInt ignores the "Mi" which means mebibyte
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

  return (
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

        const resources = {
          cpu: Math.round(formState.cpuCores * 1000) + "m",
          memory: formState.memoryInMiB + "Mi",
        };

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
              requests: resources,
              limits: resources,
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
        <Input name="name" required defaultValue={app.displayName} />
      </div>
      <div>
        <div className="flex items-baseline gap-2 mb-2">
          <Label className="pb-1">
            <Scale3D className="inline" size={16} /> Replicas
          </Label>
          <HelpTooltip size={16}>
            <p>
              The number of instances of your application running at once.
              Having multiple replicas improves fault tolerance and improves
              performance by distributing traffic.
            </p>
          </HelpTooltip>
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
        />
      </div>
      <FormContext value="UpdateApp">
        <AppConfigFormFields
          state={formState}
          setState={setFormState}
          defaults={{ config: app.config }}
          isExistingApp
        />
      </FormContext>
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
    </form>
  );
};
