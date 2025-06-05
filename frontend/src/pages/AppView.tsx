    import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
    import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
    import ConfigVar from "../components/ConfigVar";
    import { AlertDialogAction, AlertDialogFooter, AlertDialogHeader } from "../components/ui/alert-dialog";
    import { Input } from "../components/ui/input";
import { useEffect, useState } from "react";
import { AppApi } from "@/generated/openapi/apis";
import { redirect, useParams } from "react-router-dom";
import { RequiredError, ResponseError } from "@/generated/openapi/runtime";
import { toast } from "sonner";
import type { ApiError } from "@/generated/openapi/models";

    interface App {
        name: string | undefined;
        link: string | undefined;
        info: string | undefined;
        env: {[key: string] : string};
        secrets: {[key: string] : string};
    };
const app: App = {
            name: 'My Project',
            link: 'https://google.com',
            info: 'taskforge is a lightweight, modular task-management API built with Node.js, Express 5, and TypeScript. It exposes a RESTful interface for creating, updating, and tracking tasks, with optional real-time updates via WebSocket. The design emphasizes clean architecture, test-driven development, and zero-downtime deployments.',
            env: { 'NODE_ENV': 'prod' },
            secrets: { 'POSTGRES_URL': 'postgres://db' },
        }
    export default function AppView() {
        const [app, setApp] = useState<App | null>(null);
        const params = useParams();
        useEffect(() => {
            (async () => {
                const api = new AppApi();
                try {
                    const res = await api.getAppByID({ appId: parseInt(params.id || "") });
                    setApp({
                        name: res.name,
                        link: res.repositoryURL,
                        info: "info",
                        env: { "NODE_ENV" : "production" },
                        secrets: { "POSTGRES_URL" : "postgres://db" },
                    });
                } catch (e) {
                    if (e instanceof RequiredError) {
                        redirect('/dashboard');
                    }
                
                    if (e instanceof ResponseError) {
                        if (e.response.status === 401) {
                            redirect('/dashboard');
                        } else {
                            const apiErr = (await e.response.json()) as ApiError;
                            toast(apiErr.message,  {
                                action: {
                                    label: 'Close',
                                    onClick: () => {}
                                }
                            });
                        }
                    }
                }
            })();
        }, []);
        if (!app) return;
        return <>
            <h2>{app.name}</h2>
            <Tabs defaultValue='overview'>
                <TabsList>
                    <TabsTrigger value='overview'>Overview</TabsTrigger>
                    <TabsTrigger value='configuration'>Configuration</TabsTrigger>
                    <TabsTrigger value='logs'>Logs</TabsTrigger>
                    <TabsTrigger value='danger'>Danger</TabsTrigger>
                </TabsList>
                <TabsContent value='overview'>{app.info}</TabsContent>
                <TabsContent value='configuration'>
                    <h3>Environment variables</h3>
                    { Object.keys(app.env).map(key => <ConfigVar name={key} value={app.env[key]} />) }
                    <h3>Secrets</h3>
                    { Object.keys(app.secrets).map(key => <ConfigVar name={key} value={app.env[key]} secret/>)}
                </TabsContent>
                <TabsContent value='danger'>
                    <AlertDialog>
                        <AlertDialogTrigger>Delete Project</AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Confirm delete project</AlertDialogTitle>
                                <AlertDialogDescription>
                                    <p>This action cannot be undone.</p>
                                    <p>Type the project name <b>{app.name}</b> to continue</p>
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
