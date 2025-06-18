import { EnvVarGrid } from "@/components/EnvVarGrid";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { components, paths } from "@/generated/openapi";
import { api } from "@/lib/api";
import {
  GitBranch,
  Loader,
  Logs,
  SatelliteDish,
  Save,
  Server,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertDialogAction,
  AlertDialogFooter,
  AlertDialogHeader,
} from "../components/ui/alert-dialog";
import { Input } from "../components/ui/input";
import { cn } from "@/lib/utils";

type App = components["schemas"]["App"];

export default function AppView() {
  const params = useParams();
  const { data: app } = api.useSuspenseQuery("get", "/app/{appId}", {
    params: { path: { appId: parseInt(params.id!) } },
  });

  const [env, setEnv] = useState<{ name: string; value: string }[]>([]);

  useEffect(() => {
    if (
      app?.config?.env !== undefined &&
      Object.keys(app.config.env).length > 0 &&
      env.length === 0
    ) {
      setEnv(app.config.env);
    }
  }, [app?.config?.env]);

  return (
    <main className="px-8 py-10">
      <h1 className="text-3xl font-bold mb-4">{app.name}</h1>
      <Tabs defaultValue="overview">
        <TabsList className="mb-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="configuration">Configuration</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="danger">Danger</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <OverviewTab app={app} />
        </TabsContent>
        <TabsContent value="configuration">
          <h3 className="flex items-center gap-2 text-xl font-medium mb-2">
            <Server className="inline" />
            Environment variables
          </h3>
          <EnvVarGrid value={env} setValue={setEnv} />
          <Button className="mt-8">
            <Save /> Save
          </Button>
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

const OverviewTab = ({ app }: { app: App }) => {
  const { data: deployments, isPending } = api.useQuery(
    "get",
    "/app/{appId}/deployments",
    { params: { path: { appId: app.id } } },
  );

  const format = new Intl.DateTimeFormat(undefined, {
    dateStyle: "short",
    timeStyle: "medium",
  });

  return (
    <>
      <h3 className="text-xl font-medium">Recent Deployments</h3>
      <p className="opacity-50 mb-2">
        Automatically triggered from pushes to{" "}
        <a href={`${app.repositoryURL}/tree/${app.config.branch}`}>
          <GitBranch className="inline" size={16} />{" "}
          <code>{app.config.branch}</code>
        </a>
        .
      </p>
      {isPending && deployments === undefined ? (
        <Loader className="animate-spin" />
      ) : (
        <table className="my-4 [&_:is(th,td):first-child]:pr-4 [&_:is(th,td):last-child]:pl-4 [&_:is(th,td):not(:first-child,:last-child)]:px-4">
          <thead>
            <tr className="*:text-start *:pb-2">
              <th>Last Updated</th>
              <th>Commit Hash</th>
              <th>Commit Message</th>
              <th>Status</th>
              <th>Logs</th>
            </tr>
          </thead>
          <tbody>
            {deployments?.map((d) => (
              <tr key={d.id}>
                <td>
                  {format.format(new Date((d.updatedAt ?? d.createdAt)!))}
                </td>
                <td>
                  <a href={`${app.repositoryURL}/commit/${d.commitHash}`}>
                    {d.commitHash?.substring(0, 7)}
                  </a>
                </td>
                <td>{d.commitMessage}</td>
                <td>
                  <Status status={d.status as DeploymentStatus} />
                </td>
                <td>
                  <Link to={`/app/${app.id}/deployment/${d.id}`}>
                    <Button size="icon" variant="secondary">
                      <Logs />
                    </Button>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
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

  return (
    <div className={cn("inline-flex items-center gap-1", className)}>
      <div className={`size-2 rounded-full ${colors[status]}`} />
      {status.substring(0, 1) + status.toLowerCase().substring(1)}
    </div>
  );
};

const LogsTab = ({ app }: { app: App }) => {
  const { data } = api.useQuery(
    "get",
    "/app/{appId}/logs",
    { params: { path: { appId: app.id } } },
    { refetchInterval: 3000 },
  );

  return (
    <div className="bg-gray-100 font-mono w-full rounded-md my-4 p-4">
      {data?.available ? (
        <pre>
          <code>{data.logs}</code>
        </pre>
      ) : (
        <p className="flex gap-2 text-lg font-medium">
          <SatelliteDish /> Logs Unavailable
        </p>
      )}
    </div>
  );
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
              Type the project name <b>{app.name}</b> to continue.
            </p>
            <Input
              placeholder={app.name}
              value={text}
              onChange={(e) => setText(e.currentTarget.value)}
            />
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={text !== app.name}
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
  );
};
