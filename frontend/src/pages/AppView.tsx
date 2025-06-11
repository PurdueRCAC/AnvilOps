import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { LoaderIcon } from "lucide-react";
import { useParams } from "react-router-dom";
import {
  AlertDialogAction,
  AlertDialogFooter,
  AlertDialogHeader,
} from "../components/ui/alert-dialog";
import { Input } from "../components/ui/input";

export default function AppView() {
  const params = useParams();
  const { data: app, isPending } = api.useQuery("get", "/app/{appId}", {
    params: { path: { appId: parseInt(params.id!) } },
  });

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
        <TabsList>
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
          <h3>Environment variables</h3>
          {/* {Object.keys(app.env).map((key) => (
            <ConfigVar name={key} value={app.env[key]} />
          ))}
          <h3>Secrets</h3>
          {Object.keys(app.secrets).map((key) => (
            <ConfigVar name={key} value={app.env[key]} secret />
          ))} */}
        </TabsContent>
        <TabsContent value="danger">
          <AlertDialog>
            <AlertDialogTrigger>Delete Project</AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirm delete project</AlertDialogTitle>
                <AlertDialogDescription>
                  <p>This action cannot be undone.</p>
                  <p>
                    Type the project name <b>{app.name}</b> to continue
                  </p>
                  <Input />
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </TabsContent>
      </Tabs>
    </main>
  );
}
