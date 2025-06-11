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
    return <LoaderIcon className="animate-spin" />;
  }

  return (
    <>
      <h2>{app.name}</h2>
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="configuration">Configuration</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="danger">Danger</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">{/* {app.description} */}</TabsContent>
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
    </>
  );
}
