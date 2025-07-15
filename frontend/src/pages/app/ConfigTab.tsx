import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { components } from "@/generated/openapi";
import { api } from "@/lib/api";
import type { RefetchOptions } from "@tanstack/react-query";
import { Loader, Save, Scale3D, TextCursorInput } from "lucide-react";
import { useState, type Dispatch } from "react";
import { toast } from "sonner";
import { Input } from "../../components/ui/input";
import AppConfigFormFields, {
  type AppInfoFormData,
} from "@/pages/create-app/AppConfigFormFields";
import type { App } from "./AppView";
import { FormContext } from "../create-app/CreateAppView";

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
    subdomain: "",
    orgId: app.orgId,
    groupOption: app.appGroup.standalone ? "standalone" : "add-to",
    groupId: app.appGroup.id,
    source: app.config.source,
    ...(app.config.source === "git"
      ? {
          repositoryId: app.config.repositoryId,
          branch: app.config.branch,
          event: app.config.event,
          eventId: app.config.eventId?.toString() ?? undefined,
          rootDir: app.config.rootDir,
          dockerfilePath: app.config.dockerfilePath,
          builder: app.config.builder,
        }
      : {
          imageTag: app.config.imageTag,
          dockerfilePath: "Dockerfile",
          builder: "railpack",
        }),
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
          await updateApp({
            params: { path: { appId: app.id } },
            body: {
              name: formData.get("name")!.toString(),
              appGroup,
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
                      branch: formState.branch,
                      builder: formState.builder,
                      rootDir: formState.rootDir!,
                      dockerfilePath: formState.dockerfilePath!,
                      event: formState.event!,
                      eventId: formState.eventId
                        ? parseInt(formState.eventId)
                        : null,
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
            setTab("status");
          }
          refetch({});
        } catch (e) {
          toast.error("There was a problem reconfiguring your app.");
        }
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
          hideSubdomainInput
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
