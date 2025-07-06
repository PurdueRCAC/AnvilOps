import { DeploymentStatus } from "@/components/DeploymentStatus";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { components, paths } from "@/generated/openapi";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { ConfigTab } from "./ConfigTab";
import { DangerZoneTab } from "./DangerZoneTab";
import { LogsTab } from "./LogsTab";
import { OverviewTab } from "./OverviewTab";
import { StatusTab } from "./StatusTab";

export type App = components["schemas"]["App"];

export default function AppView() {
  const params = useParams();
  const { data: app, refetch } = api.useSuspenseQuery(
    "get",
    "/app/{appId}",
    {
      params: { path: { appId: parseInt(params.id!) } },
    },
    { refetchInterval: 10_000 },
  );

  const { data: currentDeployment } = api.useQuery(
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
        if (data?.podStatus?.ready !== data?.podStatus?.total) {
          if (data?.podStatus?.scheduled !== data?.podStatus?.total) {
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
      <div className="mb-2 space-x-3">
        <h1 className="text-3xl font-bold inline align-middle">
          {app.displayName}
        </h1>
        {!app.appGroup.standalone && (
          <h2 className="text-xl text-black-3 inline align-middle">
            {app.appGroup.name}
          </h2>
        )}
      </div>
      <DeploymentStatus app={app} deployment={currentDeployment} />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="my-4">
          <TabsTrigger value="overview">
            <span>Overview</span>
          </TabsTrigger>
          <TabsTrigger value="status">
            <span>Status</span>
          </TabsTrigger>
          <TabsTrigger value="configuration">
            <span>Configuration</span>
          </TabsTrigger>
          <TabsTrigger value="logs">
            <span>Logs</span>
          </TabsTrigger>
          <TabsTrigger value="danger">
            <span>Danger</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <OverviewTab
            app={app}
            activeDeployment={currentDeployment?.id}
            refetch={refetch}
          />
        </TabsContent>
        <TabsContent value="status">
          <StatusTab app={app} activeDeployment={currentDeployment} />
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
