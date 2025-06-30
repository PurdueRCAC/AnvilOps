import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import type { RefetchOptions } from "@tanstack/react-query";
import { Loader, Save, Scale3D, TextCursorInput } from "lucide-react";
import { useState, type Dispatch } from "react";
import { toast } from "sonner";
import { Input } from "../../components/ui/input";
import { AppConfigFormFields, type AppInfoFormData } from "../CreateAppView";
import type { App } from "./AppView";

export const ConfigTab = ({
  app,
  setTab,
  refetch,
}: {
  app: App;
  setTab: Dispatch<string>;
  refetch: (options: RefetchOptions | undefined) => Promise<any>;
}) => {
  const [formState, setFormState] = useState<AppInfoFormData>({
    env: app.config.env,
    mounts: app.config.mounts,
    builder: app.config.builder ?? "railpack",
    orgId: app.orgId,
    repoId: app.config.repositoryId ?? undefined,
    source: app.config.source,
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
          await updateApp({
            params: { path: { appId: app.id } },
            body: {
              name: formData.get("name")!.toString(),
              config: {
                source: formState.source!,
                port: parseInt(formData.get("port")!.toString()),
                dockerfilePath:
                  formData.get("dockerfilePath")?.toString() ?? null,
                env: formState.env.filter((it) => it.name.length > 0),
                repositoryId: formState.repoId ?? null,
                branch: formData.get("branch")?.toString() ?? null,
                builder: (formData.get("builder")?.toString() ?? null) as
                  | "dockerfile"
                  | "railpack"
                  | null,
                rootDir: formData.get("rootDir")?.toString() ?? null,
                mounts: formState.mounts.filter((it) => it.path.length > 0),
                imageTag: formData.get("imageTag")?.toString() ?? null,
                replicas: parseInt(formData.get("replicas")!.toString()),
              },
            },
          });

          toast.success("App updated successfully!");
          setTab("overview");
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
      <AppConfigFormFields
        state={formState}
        setState={setFormState}
        defaults={{ config: app.config }}
        hideSubdomainInput
      />
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
