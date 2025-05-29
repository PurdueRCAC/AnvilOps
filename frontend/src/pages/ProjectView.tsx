import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type LoaderFunctionArgs } from "react-router-dom";
import ConfigVar from "../components/ConfigVar";
import { AlertDialogAction, AlertDialogFooter, AlertDialogHeader } from "../components/ui/alert-dialog";
import { Input } from "../components/ui/input";

interface Project {
    name: string;
    link: string;
    info: string;
    env: {[key: string] : string};
    secrets: {[key: string] : string};
    logs: string[]
};

export async function projectLoader({ params }: LoaderFunctionArgs) : Promise<Project> {
  const res = await fetch(`/api/projects/${params.id}`);

  if (!res.ok) {
    throw new Response("Project not found", { status: res.status });
  }
  return res.json();
}

export default function ProjectView() {
    // const project = useLoaderData();
    const project: Project = {
        name: 'My Project',
        link: 'https://google.com',
        info: 'taskforge is a lightweight, modular task-management API built with Node.js, Express 5, and TypeScript. It exposes a RESTful interface for creating, updating, and tracking tasks, with optional real-time updates via WebSocket. The design emphasizes clean architecture, test-driven development, and zero-downtime deployments.',
        env: { 'NODE_ENV': 'prod' },
        secrets: { 'POSTGRES_URL': 'postgres://db' },
        logs: [
            '2025-05-28T18:43:12.527Z [INFO]  User authenticated            reqId=0387 ms=21',
            '2025-05-28T18:44:18.457Z [WARN]  Rate limit exceeded           reqId=7612 ms=2',
            '2025-05-28T18:45:07.301Z [DEBUG] Cache miss ─ fetching from DB reqId=2289 ms=87',
            '2025-05-29T00:00:10.295Z [TRACE] Cache miss ─ fetching from DB       reqId=7503 ms=377',
            '2025-05-29T00:01:00.295Z [DEBUG] Cache miss ─ fetching from DB       reqId=8228 ms=281',
            '2025-05-29T00:01:44.295Z [DEBUG] User logout                         reqId=0544 ms=319',
            '2025-05-29T00:01:58.295Z [TRACE] Rate limit exceeded                 reqId=4742 ms=408',
        ]
    }
     return <>
        <h2>{project.name}</h2>
        <Tabs defaultValue='overview'>
            <TabsList>
                <TabsTrigger value='overview'>Overview</TabsTrigger>
                <TabsTrigger value='configuration'>Configuration</TabsTrigger>
                <TabsTrigger value='logs'>Logs</TabsTrigger>
                <TabsTrigger value='danger'>Danger</TabsTrigger>
            </TabsList>
            <TabsContent value='overview'>{project.info}</TabsContent>
            <TabsContent value='configuration'>
                <h3>Environment variables</h3>
                { Object.keys(project.env).map(key => <ConfigVar name={key} value={project.env[key]} />) }
                <h3>Secrets</h3>
                { Object.keys(project.secrets).map(key => <ConfigVar name={key} value={project.env[key]} secret/>)}
            </TabsContent>
            <TabsContent value='logs'>
                { project.logs.map(log => <p>{log}</p>) }
            </TabsContent>
            <TabsContent value='danger'>
                <AlertDialog>
                    <AlertDialogTrigger>Delete Project</AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Confirm delete project</AlertDialogTitle>
                            <AlertDialogDescription>
                                <p>This action cannot be undone.</p>
                                <p>Type the project name <b>{project.name}</b> to continue</p>
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
}
