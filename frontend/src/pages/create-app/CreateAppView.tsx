import { UserContext } from "@/components/UserProvider";
import { AppConfigFormFields } from "@/components/config/AppConfigFormFields";
import { GroupConfigFields } from "@/components/config/GroupConfigFields";
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
import { api } from "@/lib/api";
import {
  createDefaultCommonFormFields,
  createNewAppWithoutGroup,
} from "@/lib/form";
import type { CommonFormFields, GroupFormFields } from "@/lib/form.types";
import { Check, Globe, Loader, Rocket, X } from "lucide-react";
import { createContext, useContext, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

export default function CreateAppView() {
  const { user } = useContext(UserContext);

  const { mutateAsync: createApp, isPending: createPending } = api.useMutation(
    "post",
    "/app",
  );

  const [search] = useSearchParams();

  const [groupState, setGroupState] = useState<GroupFormFields>({
    orgId: search.has("org")
      ? parseInt(search.get("org")!)
      : user?.orgs?.[0]?.id,
    groupOption: { type: "standalone" },
  });

  const [appState, setAppState] = useState<CommonFormFields>(
    createDefaultCommonFormFields({
      repositoryId: search.has("repo")
        ? parseInt(search.get("repo")!.toString())
        : undefined,
    }),
  );

  const navigate = useNavigate();

  const shouldShowDeploy =
    groupState.orgId === undefined ||
    appState.source !== "git" ||
    user?.orgs.some(
      (org) => org.id === groupState.orgId && org.gitProvider !== null,
    );

  return (
    <div className="flex max-w-prose mx-auto">
      <form
        className="flex flex-col gap-6 w-full my-10"
        onSubmit={async (e) => {
          e.preventDefault();
          const finalGroupState = groupState as Required<GroupFormFields>;
          const finalAppState = appState as Required<CommonFormFields>;

          try {
            const result = await createApp({
              body: {
                orgId: finalGroupState.orgId,
                appGroup: finalGroupState.groupOption,
                ...createNewAppWithoutGroup(finalAppState),
              },
            });
            navigate(`/app/${result.id}`);
          } catch (err) {}
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
              setGroupState((prev) => ({ ...prev, orgId: parseInt(orgId) }))
            }
            value={groupState.orgId?.toString()}
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
        <GroupConfigFields state={groupState} setState={setGroupState} />
        <FormContext value="CreateApp">
          <AppConfigFormFields
            groupState={groupState}
            state={appState}
            setState={setAppState}
          />
        </FormContext>
        {shouldShowDeploy ? (
          <Button size="lg" type="submit">
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

export const NameStatus = ({
  available,
  resourceName,
}: {
  available: boolean;
  resourceName: string;
}) => {
  const capitalized =
    resourceName.charAt(0).toUpperCase() + resourceName.slice(1);
  return available ? (
    <p className="text-green-500 text-sm">
      <Check className="inline" /> {capitalized} is available.
    </p>
  ) : (
    <p className="text-red-500 text-sm">
      <X className="inline" /> {capitalized} is in use.
    </p>
  );
};

export const FormContext = createContext<
  "CreateApp" | "CreateAppGroup" | "UpdateApp" | "ReuseApp"
>("CreateApp");
