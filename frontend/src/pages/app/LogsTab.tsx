import { Logs } from "@/components/Logs";
import { api } from "@/lib/api";
import { Loader } from "lucide-react";
import type { App } from "./AppView";

export const LogsTab = ({ app }: { app: App }) => {
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
