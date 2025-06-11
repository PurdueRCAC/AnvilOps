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
import type { components } from "@/generated/openapi";
import { api } from "@/lib/api";
import { LoaderIcon, Save, Server } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertDialogAction,
  AlertDialogFooter,
  AlertDialogHeader,
} from "../components/ui/alert-dialog";
import { Input } from "../components/ui/input";

type App = components["schemas"]["App"];

export default function AppView() {
  const params = useParams();
  const { data: app, isPending } = api.useQuery("get", "/app/{appId}", {
    params: { path: { appId: parseInt(params.id!) } },
  });

  const [env, setEnv] = useState<{ key: string; value: string }[]>([]);

  useEffect(() => {
    if (
      app?.config?.env !== undefined &&
      Object.keys(app.config.env).length > 0 &&
      env.length === 0
    ) {
      setEnv(
        Object.entries(app.config.env).map(([key, value]) => ({ key, value })),
      );
    }
  }, [app?.config?.env]);

  if (!app || isPending) {
    return (
      <div className="flex w-full min-h-96 items-center justify-center">
        <LoaderIcon className="animate-spin" size={48} />
      </div>
    );
  }

  return (
    <main className="px-8 py-10">
      <h2 className="text-3xl font-bold mb-4">{app.name}</h2>
      <Tabs defaultValue="overview">
        <TabsList className="mb-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="configuration">Configuration</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="danger">Danger</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <pre>
            <code>{JSON.stringify(app, null, 2)}</code>
          </pre>
        </TabsContent>
        <TabsContent value="configuration">
          <h3 className="flex items-center gap-2 text-lg font-medium mb-2">
            <Server className="inline" />
            Environment variables
          </h3>
          <EnvVarGrid value={env} setValue={setEnv} />
          <Button className="mt-8">
            <Save /> Save
          </Button>
        </TabsContent>
        <TabsContent value="danger">
          <DangerZoneTab app={app} />
        </TabsContent>
      </Tabs>
    </main>
  );
}

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
