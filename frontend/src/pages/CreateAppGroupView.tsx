import { UserContext } from "@/components/UserProvider";
import { api } from "@/lib/api";
import {
  Fragment,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { AppConfigFormFields, type AppInfoFormData } from "./CreateAppView";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Globe, Loader, Plus, Rocket, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { components } from "@/generated/openapi";

export default function CreateAppGroupView() {
  const { user } = useContext(UserContext);

  const { mutateAsync: createAppGroup, isPending: createPending } =
    api.useMutation("post", "/app/group");

  const [orgId, setOrgId] = useState<number | undefined>(user?.orgs?.[0]?.id);

  const [appStates, setAppStates] = useState<AppInfoFormData[]>([
    {
      env: [{ name: "", value: "", isSensitive: false }],
      mounts: [{ path: "", amountInMiB: 1024 }],
      source: "git",
      builder: "railpack",
      subdomain: "",
      rootDir: "./",
      dockerfilePath: "Dockerfile",
    },
  ]);

  const [tab, setTab] = useState("0");

  const navigate = useNavigate();
  const shouldShowDeploy = useMemo(() => {
    return (
      orgId === undefined ||
      user?.orgs.some((org) => org.id === orgId && org.githubConnected)
    );
  }, [user, orgId]);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setAppStates((appStates) =>
      appStates.map((state) => ({ ...state, orgId })),
    );
  }, [orgId]);

  const [groupName, setGroupName] = useState("");
  const isGroupNameValid = useMemo(() => {
    const MAX_GROUP_LENGTH = 56;
    return (
      groupName.length <= MAX_GROUP_LENGTH &&
      groupName.match(/^[a-zA-Z0-9][ a-zA-Z0-9-_\.]*$/)
    );
  }, [groupName]);

  return (
    <div className="flex max-w-prose mx-auto">
      <form
        className="flex flex-col gap-6 w-full my-10 spa"
        onSubmit={async (e) => {
          e.preventDefault();
          const formData = new FormData(e.currentTarget);
          try {
            const apps = appStates.map(
              (appState): components["schemas"]["NewApp"] => {
                return {
                  orgId: orgId!,
                  name: getAppName(appState),
                  subdomain: appState.subdomain,
                  port: parseInt(appState.port!),
                  env: appState.env.filter((ev) => ev.name.length > 0),
                  mounts: appState.mounts.filter((m) => m.path.length > 0),
                  appGroup: {
                    type: "add-to" as "add-to",
                    id: -1,
                  },
                  ...(appState.source === "git"
                    ? {
                        source: "git",
                        repositoryId: appState.repositoryId!,
                        branch: appState.branch!,
                        event: appState.event!,
                        eventId: appState.eventId
                          ? parseInt(appState.eventId)
                          : null,
                        dockerfilePath: appState.dockerfilePath!,
                        rootDir: appState.rootDir!,
                        builder: appState.builder!,
                      }
                    : {
                        source: "image",
                        imageTag: appState.imageTag!,
                      }),
                };
              },
            );

            await createAppGroup({
              body: {
                name: formData.get("groupName")!.toString(),
                orgId: orgId!,
                apps,
              },
            });

            navigate("/dashboard");
          } catch (err) {
            console.error(err);
            toast.error((err as Error).message);
          }
        }}
      >
        <h2 className="font-bold text-3xl mb-4">Create a Group</h2>
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
            onValueChange={(orgId) => setOrgId(parseInt(orgId!))}
            value={orgId?.toString()}
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
        <div className="space-y-2">
          <div className="flex items-baseline gap-2">
            <Label htmlFor="groupName" className="pb-1">
              Group Name
            </Label>
            <span
              className="text-red-500 cursor-default"
              title="This field is required."
            >
              *
            </span>
          </div>
          <Input
            required
            placeholder="Group name"
            name="groupName"
            value={groupName}
            onChange={(e) => setGroupName(e.currentTarget.value)}
            autoComplete="off"
          />
          {groupName && !isGroupNameValid && (
            <div className="text-sm flex gap-5">
              <X className="text-red-500" />
              <ul className="text-black-3 list-disc">
                <li>A group name must have 56 or fewer characters.</li>
                <li>
                  A group name must contain only alphanumeric characters,
                  dashes, underscores, dots, and spaces.
                </li>
                <li>A group name must start with an alphanumeric character.</li>
              </ul>
            </div>
          )}
        </div>
        <Tabs value={tab} onValueChange={setTab}>
          <div className="my-4 relative">
            <div ref={scrollRef} className="overflow-x-auto overflow-y-clip">
              <TabsList className="w-fit">
                {appStates.map((_, idx) => (
                  <Fragment key={`tab-${idx}`}>
                    <TabsTrigger
                      value={idx.toString()}
                      disabled={orgId === undefined}
                    >
                      <span>{getAppName(appStates[idx])}</span>
                    </TabsTrigger>
                    <button type="button" key={`close-${idx}`}>
                      <X
                        className="size-3 stroke-3 inline"
                        onClick={() => {
                          if (appStates.length > 1) {
                            setAppStates((appStates) =>
                              appStates.filter((_, i) => i !== idx),
                            );
                            if (tab === idx.toString()) {
                              const side = idx - 1 > 0 ? idx - 1 : 0;
                              setTab(side.toString());
                            }
                          }
                        }}
                      />
                    </button>
                  </Fragment>
                ))}
                <Button
                  key="addApp"
                  variant="ghost"
                  type="button"
                  onClick={() => {
                    setAppStates((appStates) => [
                      ...appStates,
                      {
                        env: [{ name: "", value: "", isSensitive: false }],
                        mounts: [{ path: "", amountInMiB: 1024 }],
                        source: "git",
                        builder: "railpack",
                        orgId,
                        subdomain: "",
                        rootDir: "./",
                        dockerfilePath: "Dockerfile",
                      },
                    ]);
                  }}
                  disabled={orgId === undefined}
                >
                  <Plus className="size-4 stroke-3" />
                </Button>
              </TabsList>
            </div>
          </div>
          {appStates.map((app, idx) => (
            <TabsContent key={idx} value={idx.toString()} className="space-y-8">
              <AppConfigFormFields
                state={app}
                setState={(stateAction) => {
                  if (typeof stateAction === "function") {
                    setAppStates((appStates) =>
                      appStates.map((app, i) =>
                        i === idx ? stateAction(app) : app,
                      ),
                    );
                  } else {
                    setAppStates((appStates) =>
                      appStates.map((app, i) =>
                        i === idx ? stateAction : app,
                      ),
                    );
                  }
                }}
                hideGroupSelect
              />
            </TabsContent>
          ))}
        </Tabs>
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

const getAppName = (state: AppInfoFormData) => {
  let appName = "Untitled";
  if (state.source === "git") {
    if (state.repoName) {
      appName = state.repoName;
    }
  } else if (state.source === "image") {
    if (state.imageTag) {
      const tag = state.imageTag!.toString().split("/");
      appName = tag[tag.length - 1].split(":")[0];
    }
  }
  return appName;
};
