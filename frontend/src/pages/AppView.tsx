import { Logs } from "@/components/Logs";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { components, paths } from "@/generated/openapi";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { RefetchOptions } from "@tanstack/react-query";
import {
  CheckCheck,
  CircleDashed,
  CloudCheck,
  CloudCog,
  CloudLightning,
  CloudUpload,
  Container,
  ExternalLink,
  GitBranch,
  GitCommit,
  Link2,
  Loader,
  LogsIcon,
  Save,
  Scale3D,
  Tag,
  TextCursorInput,
} from "lucide-react";
import { useEffect, useState, type Dispatch } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertDialogAction,
  AlertDialogFooter,
  AlertDialogHeader,
} from "../components/ui/alert-dialog";
import { Input } from "../components/ui/input";
import {
  AppConfigFormFields,
  GitHubIcon,
  type AppInfoFormData,
} from "./CreateAppView";

type App = components["schemas"]["App"];

export default function AppView() {
  const params = useParams();
  const {
    data: app,
    isPending: appLoading,
    refetch,
  } = api.useSuspenseQuery(
    "get",
    "/app/{appId}",
    {
      params: { path: { appId: parseInt(params.id!) } },
    },
    { refetchInterval: 10_000 },
  );

  const { data: currentDeployment, isPending: loadingCurrentDeployment } =
    api.useQuery(
      "get",
      "/app/{appId}/deployments/{deploymentId}",
      {
        params: {
          path: { appId: app.id, deploymentId: app.activeDeployment! },
        },
      },
      {
        enabled: app.activeDeployment !== undefined,
        refetchInterval({ state: { data } }) {
          if (data?.podStatus?.ready === false) {
            if (data?.podStatus?.scheduled) {
              return 1_000;
            }
            return 3_000;
          }
          return 10_000;
        },
      },
    );

  const [tab, setTab] = useState("overview");

  return (
    <main className="px-8 py-10 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">{app.displayName}</h1>
      <Tooltip>
        {app.activeDeployment === undefined && !appLoading ? (
          <p className="opacity-50 flex items-center gap-2">
            <CircleDashed /> Waiting to deploy...
          </p>
        ) : loadingCurrentDeployment ? (
          <p className="opacity-50 flex items-center gap-2">
            <Loader className="animate-spin" /> Loading...
          </p>
        ) : currentDeployment ? (
          <>
            {currentDeployment.podStatus?.phase === "Failed" ||
            currentDeployment.podStatus?.state === "terminated" ? (
              <>
                <TooltipTrigger>
                  <p className="text-red-500 flex items-center gap-2">
                    <CloudLightning />
                    Failed
                  </p>
                </TooltipTrigger>
                <TooltipContent>
                  Your app has crashed. Check the logs for more info.
                </TooltipContent>
              </>
            ) : currentDeployment.podStatus?.ready ? (
              <>
                <TooltipTrigger>
                  <p className="text-green-500 flex items-center gap-2">
                    <CloudCheck /> Ready
                  </p>
                </TooltipTrigger>
                <TooltipContent>
                  Your app has started and is ready to receive requests.
                </TooltipContent>
              </>
            ) : currentDeployment.podStatus?.scheduled ? (
              <>
                <TooltipTrigger>
                  <p className="text-amber-600 flex items-center gap-2">
                    <CloudUpload />
                    Scheduled
                  </p>
                </TooltipTrigger>
                <TooltipContent>
                  Your app has built and is currently deploying.
                </TooltipContent>
              </>
            ) : (
              <>
                <TooltipTrigger>
                  <p className="text-yellow-600 flex items-center gap-2">
                    <CloudCog />
                    Pending
                  </p>
                </TooltipTrigger>
                <TooltipContent>
                  Your app has built and is waiting to deploy.
                </TooltipContent>
              </>
            )}
          </>
        ) : null}
      </Tooltip>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="my-4">
          <TabsTrigger value="overview" className="tab">
            <span className="tab-content">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="configuration">
            <span className="tab-content">Configuration</span>
          </TabsTrigger>
          <TabsTrigger value="logs">
            <span className="tab-content">Logs</span>
          </TabsTrigger>
          <TabsTrigger value="danger">
            <span className="tab-content">Danger</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <OverviewTab
            app={app}
            activeDeployment={currentDeployment?.id}
            refetch={refetch}
          />
        </TabsContent>
        <TabsContent value="configuration">
          <ConfigTab app={app} setTab={setTab} refetch={refetch} />
        </TabsContent>
        <TabsContent value="logs">
          <LogsTab app={app} />
        </TabsContent>
        <TabsContent value="danger">
          <DangerZoneTab app={app} />
        </TabsContent>
      </Tabs>
    </main>
  );
}

const OverviewTab = ({
  app,
  activeDeployment,
  refetch: refetchApp,
}: {
  app: App;
  activeDeployment: number | undefined;
  refetch: () => void;
}) => {
  const { data: deployments, isPending } = api.useSuspenseQuery(
    "get",
    "/app/{appId}/deployments",
    { params: { path: { appId: app.id } } },
    {
      refetchInterval: ({ state: { data } }) => {
        if (!data) return false;
        switch (data?.[0]?.status) {
          case "PENDING":
            return 1_000;
          case "BUILDING":
            return 5_000;
          case "DEPLOYING":
            return 1_000;
          default:
            return 30_000;
        }
      },
    },
  );

  const { data: status } = api.useQuery("get", "/app/{appId}/pods", {
    params: { path: { appId: app.id } },
  });

  useEffect(() => {
    // When the first deployment's status changes to Complete, refetch the app to update the "current" deployment
    if (deployments?.[0]?.status === "COMPLETE") {
      refetchApp();
    }
  }, [deployments?.[0]?.status]);

  const format = new Intl.DateTimeFormat(undefined, {
    dateStyle: "short",
    timeStyle: "medium",
  });

  return (
    <>
      <h3 className="text-xl font-medium mb-4">General</h3>
      <div className="grid grid-cols-[repeat(2,max-content)] gap-x-8 gap-y-4 max-w-max">
        {app.config.source === "git" ? (
          <>
            <p className="flex items-center gap-2">
              <GitHubIcon className="size-4" />
              Git repository
            </p>
            <p>
              <a
                href={app.repositoryURL}
                className="underline flex gap-1 items-center"
                target="_blank"
                rel="noopener noreferrer"
              >
                {URL.parse(app.repositoryURL!)?.pathname?.substring(1)}
                <ExternalLink size={14} />
              </a>
            </p>
          </>
        ) : app.config.source === "image" ? (
          <>
            <p className="flex items-center gap-2">
              <Tag className="size-4" />
              Image tag
            </p>
            <p>{app.config.imageTag}</p>
          </>
        ) : null}
        <p className="flex items-center gap-2">
          <Link2 size={16} />
          Subdomain
        </p>
        <p>
          <a
            href={`https://${app.subdomain}.anvilops.rcac.purdue.edu`}
            className="underline flex gap-1 items-center"
            target="_blank"
            rel="noopener noreferrer"
          >
            {app.subdomain}.anvilops.rcac.purdue.edu
            <ExternalLink size={14} />
          </a>
        </p>
      </div>
      <h3 className="text-xl font-medium mt-8">Recent Deployments</h3>
      <p className="opacity-50 mb-2">
        {app.config.source === "git" ? (
          <>
            Automatically triggered from pushes to{" "}
            <a href={`${app.repositoryURL}/tree/${app.config.branch}`}>
              <GitBranch className="inline" size={16} />{" "}
              <code>{app.config.branch}</code>
            </a>
            .
          </>
        ) : null}
      </p>
      {isPending && deployments === undefined ? (
        <Loader className="animate-spin" />
      ) : (
        <table className="w-full my-4 [&_:is(th,td):first-child]:pr-4 [&_:is(th,td):last-child]:pl-4 [&_:is(th,td):not(:first-child,:last-child)]:px-4">
          <thead>
            <tr className="*:text-start *:pb-2 *:font-medium border-b">
              <th>Created</th>
              <th>Source</th>
              <th>Status</th>
              <th>Logs</th>
            </tr>
          </thead>
          <tbody>
            {deployments?.map((d) => (
              <tr key={d.id}>
                <td>
                  <div className="flex items-center gap-2">
                    <span className="text-nowrap">
                      {format.format(new Date(d.createdAt))}
                    </span>
                    {d.id === activeDeployment && (
                      <Tooltip>
                        <TooltipTrigger>
                          <span
                            className="flex items-center gap-2 bg-green-500 rounded-full px-2 py-1 text-xs text-white"
                            title=""
                          >
                            <CheckCheck size={14} /> Current
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-md">
                          Your domain points to this deployment. New deployments
                          become current once the app is built and the changes
                          are rolled out.
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </td>
                <td>
                  {d.source === "GIT" ? (
                    <a
                      href={`${app.repositoryURL}/commit/${d.commitHash}`}
                      className="flex items-center gap-2"
                    >
                      <span className="opacity-50 flex items-center gap-1">
                        <GitCommit className="shrink-0" />
                        {d.commitHash?.substring(0, 7)}
                      </span>
                      {d.commitMessage}
                    </a>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger>
                        <p className="flex items-center gap-2">
                          <Container />{" "}
                          <span className="truncate max-w-96">
                            {d.imageTag}
                          </span>
                        </p>
                      </TooltipTrigger>
                      <TooltipContent>{d.imageTag}</TooltipContent>
                    </Tooltip>
                  )}
                </td>
                <td>
                  <Status status={d.status as DeploymentStatus} />
                </td>
                <td className="py-2">
                  <Link to={`/app/${app.id}/deployment/${d.id}`}>
                    <Button size="icon" variant="secondary">
                      <LogsIcon />
                    </Button>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h3 className="text-xl font-medium mb-4">Status</h3>
      <pre>
        <code>{JSON.stringify(status, null, 2)}</code>
      </pre>
    </>
  );
};

export type DeploymentStatus =
  paths["/app/{appId}/deployments/{deploymentId}"]["get"]["responses"]["200"]["content"]["application/json"]["status"];

export const Status = ({
  status,
  className,
}: {
  status: DeploymentStatus;
  className?: string;
}) => {
  const colors: Record<DeploymentStatus, string> = {
    PENDING: "bg-amber-500",
    BUILDING: "bg-blue-500",
    DEPLOYING: "bg-purple-500",
    COMPLETE: "bg-green-500",
    ERROR: "bg-red-500",
    STOPPED: "bg-gray-600",
  };

  if (!status || !colors[status]) {
    return (
      <div className={cn("inline-flex items-center gap-2", className)}>
        <div className={`size-2 rounded-full bg-gray-300`} />
        Unknown
      </div>
    );
  }

  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      <div className={`size-2 rounded-full ${colors[status]}`} />
      {status.substring(0, 1) + status.toLowerCase().substring(1)}
    </div>
  );
};

const ConfigTab = ({
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
          console.error(e);
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

const LogsTab = ({ app }: { app: App }) => {
  const { data: deployments } = api.useSuspenseQuery(
    "get",
    "/app/{appId}/deployments",
    { params: { path: { appId: app.id } } },
  );

  const mostRecentDeployment = deployments?.[0];

  if (!mostRecentDeployment) {
    return <Loader className="animate-spin" />;
  }

  return <Logs deployment={mostRecentDeployment} type="RUNTIME" />;
};

const DangerZoneTab = ({ app }: { app: App }) => {
  const { mutateAsync: deleteProject } = api.useMutation(
    "delete",
    "/app/{appId}",
  );

  const navigate = useNavigate();
  const params = useParams();

  const appId = parseInt(params.id!);

  const [text, setText] = useState("");

  return (
    <>
      <h2 className="text-xl font-medium mb-2">Delete Project</h2>
      <p className="opacity-50 mb-4">
        Permanently delete all deployments, logs, and compute resources
        associated with this project without affecting the source Git
        repository.
      </p>
      <AlertDialog>
        <AlertDialogTrigger>
          <Button variant="destructive">Delete Project</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm delete project</AlertDialogTitle>
            <AlertDialogDescription>
              <p>
                This action cannot be undone.
                <ul className="*:list-disc *:ml-4 mt-2 mb-4">
                  <li>
                    Your AnvilOps project and all associated deployments and
                    infrastructure will be deleted.
                  </li>
                  <li>
                    Your project's subdomain will become available for other
                    projects to use.
                  </li>
                  <li>Your Git repository will be unaffected.</li>
                </ul>
              </p>
              <p className="mb-2">
                Type the project name <b>{app.displayName}</b> to continue.
              </p>
              <Input
                placeholder={app.displayName}
                value={text}
                onChange={(e) => setText(e.currentTarget.value)}
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={text !== app.displayName}
              onClick={async () => {
                try {
                  await deleteProject({
                    params: { path: { appId: appId } },
                  });
                } catch (e) {
                  toast.error("There was a problem deleting your project.");
                  return;
                }
                toast.success("Your project has been deleted.");
                navigate("/dashboard");
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
