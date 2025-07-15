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
import { api } from "@/lib/api";
import { Check, Globe, Loader, Rocket, X } from "lucide-react";
import { createContext, useContext, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import AppConfigFormFields, {
  type AppInfoFormData,
} from "./AppConfigFormFields";

export default function CreateAppView() {
  const { user } = useContext(UserContext);

  const { mutateAsync: createApp, isPending: createPending } = api.useMutation(
    "post",
    "/app",
  );

  const [search] = useSearchParams();

  const [formState, setFormState] = useState<AppInfoFormData>({
    groupOption: "standalone",
    env: [],
    mounts: [],
    orgId: search.has("org")
      ? parseInt(search.get("org")!.toString())
      : user?.orgs?.[0]?.id,
    repositoryId: search.has("repo")
      ? parseInt(search.get("repo")!.toString())
      : undefined,
    source: "git",
    event: "push",
    builder: "railpack",
    dockerfilePath: "Dockerfile",
    rootDir: "./",
    subdomain: "",
  });

  const navigate = useNavigate();

  const shouldShowDeploy = useMemo(() => {
    return (
      formState.orgId === undefined ||
      user?.orgs.some(
        (org) => org.id === formState.orgId && org.githubConnected,
      )
    );
  }, [user, formState.orgId]);

  return (
    <div className="flex max-w-prose mx-auto">
      <form
        className="flex flex-col gap-6 w-full my-10"
        onSubmit={async (e) => {
          e.preventDefault();
          const formData = new FormData(e.currentTarget);

          let appName = "untitled";
          if (formState.source === "git") {
            // https://kubernetes.io/docs/concepts/overview/working-with-objects/names/#dns-label-names
            appName = formState.repoName!.toLowerCase().substring(0, 64);
          } else if (formState.source === "image") {
            const tag = formState.imageTag!.split("/");
            appName = tag[tag.length - 1].split(":")[0];
          }
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
            const result = await createApp({
              body: {
                orgId: formState.orgId!,
                name: appName,
                subdomain: formState.subdomain!,
                port: parseInt(formState.port!),
                env: formState.env.filter((ev) => ev.name.length > 0),
                mounts: formState.mounts.filter((m) => m.path.length > 0),
                appGroup,
                ...(formState.source === "git"
                  ? {
                      source: "git",
                      repositoryId: formState.repositoryId!,
                      dockerfilePath: formState.dockerfilePath!,
                      rootDir: formState.rootDir!,
                      branch: formState.branch!,
                      builder: formState.builder!,
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
            });

            navigate(`/app/${result.id}`);
          } catch (err) {
            toast.error((err as Error).message);
          }
        }}
      >
        <h2 className="font-bold text-3xl mb-4">Create an App</h2>
        <div className="space-y-2">
          <div className="flex items-baseline gap-2">
            <Label htmlFor="selectOrg" className="pb-1">
              <Globe className="inline" size={16} />
              Organization
            </Label>
            <span
              className="text-red-500 cursor-default"
              title="This field is required."
            >
              *
            </span>
          </div>
          <Select
            required
            onValueChange={(orgId) =>
              setFormState((prev) => ({ ...prev, orgId: parseInt(orgId!) }))
            }
            value={formState.orgId?.toString()}
            name="org"
          >
            <SelectTrigger className="w-full" id="selectOrg">
              <SelectValue placeholder="Select an organization" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {user?.orgs?.map((org) => (
                  <SelectItem key={org.id} value={org.id.toString()}>
                    {org.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <FormContext value="CreateApp">
          <AppConfigFormFields state={formState} setState={setFormState} />
        </FormContext>
        {shouldShowDeploy ? (
          <Button className="mt-8" size="lg" type="submit">
            {createPending ? (
              <>
                <Loader className="animate-spin" /> Deploying...
              </>
            ) : (
              <>
                <Rocket />
                Deploy
              </>
            )}
          </Button>
        ) : null}
      </form>
    </div>
  );
}

export const GitHubIcon = ({ className }: { className?: string }) => (
  <svg
    role="img"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
    fill="currentColor"
    className={className}
  >
    <title>GitHub</title>
    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
  </svg>
);

export type NonNullableEnv = {
  name: string;
  value: string;
  isSensitive: boolean;
}[];

export const SubdomainStatus = ({ available }: { available: boolean }) => {
  return available ? (
    <span className="text-green-500 text-sm">
      <Check className="inline" /> Subdomain is available.
    </span>
  ) : (
    <span className="text-red-500 text-sm">
      <X className="inline" /> Subdomain is in use.
    </span>
  );
};

export const FormContext = createContext<
  "CreateApp" | "CreateAppGroup" | "UpdateApp"
>("CreateApp");
