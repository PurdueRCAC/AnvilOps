import { UserContext } from "@/components/UserProvider";
import { api } from "@/lib/api";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  AppConfigFormFields,
  type AppInfoFormData,
  type NonNullableEnv,
} from "./CreateAppView";
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
import { cn } from "@/lib/utils";

export default function CreateAppGroupView() {
  const { user } = useContext(UserContext);

  const { mutateAsync: createAppGroup, isPending: createPending } =
    api.useMutation("post", "/app/group");

  const [orgId, setOrgId] = useState<number | undefined>();

  const [appStates, setAppStates] = useState<AppInfoFormData[]>([
    {
      env: [],
      mounts: [],
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

  // Tracking whether tab list is scrolled to start or end
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const update = () => {
      setAtStart(el.scrollLeft <= 0);
      setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1);
    };

    // passive avoids blocking the main thread while scrolling
    el.addEventListener("scroll", update, { passive: true });
    return () => el.removeEventListener("scroll", update);
  }, []);

  useEffect(() => {
    setAppStates((appStates) =>
      appStates.map((state) => ({ ...state, orgId })),
    );
  }, [orgId]);
  return (
    <div className="flex max-w-prose mx-auto">
      <form
        className="flex flex-col gap-6 w-full my-10 spa"
        onSubmit={async (e) => {
          e.preventDefault();
          const formData = new FormData(e.currentTarget);
          try {
            const apps = appStates.map((appState) => {
              return {
                source: appState.source!,
                orgId: orgId!,
                name: getAppName(appState),
                port: parseInt(appState.port!),
                subdomain: appState.subdomain,
                dockerfilePath: appState.dockerfilePath ?? null,
                env: appState.env.filter(
                  (it) => it.name.length > 0,
                ) as NonNullableEnv,
                repositoryId: appState.repositoryId ?? null,
                branch: appState.branch ?? null,
                builder:
                  appState.builder ??
                  (null as "dockerfile" | "railpack" | null),
                rootDir: appState.rootDir ?? null,
                mounts: appState.mounts.filter((it) => it.path.length > 0),
                imageTag: appState.imageTag ?? null,
                appGroup: {
                  type: "add-to" as "add-to",
                  id: -1,
                },
              };
            });

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
          <Input required placeholder="Group name" name="groupName" />
        </div>
        <Tabs value={tab} onValueChange={setTab}>
          <div className="my-4 relative">
            <TabsList
              ref={scrollRef}
              className="w-fit max-w-full overflow-x-scroll overflow-y-clip"
            >
              {appStates.map((_, idx) => (
                <>
                  <TabsTrigger
                    key={idx}
                    value={idx.toString()}
                    disabled={orgId === undefined}
                  >
                    <span>{getAppName(appStates[idx])}</span>
                  </TabsTrigger>
                  <button type="button">
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
                </>
              ))}
              <Button
                key="addApp"
                variant="ghost"
                type="button"
                onClick={() => {
                  setAppStates((appStates) => [
                    ...appStates,
                    {
                      env: [],
                      mounts: [],
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
            <span
              className={cn(
                "pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-black/10 to-transparent transition-opacity",
                atStart ? "opacity-0" : "opacity-100",
              )}
            />

            {/* right shadow */}
            <span
              className={cn(
                "pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-black/10 to-transparent transition-opacity",
                atEnd ? "opacity-0" : "opacity-100",
              )}
            />
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
