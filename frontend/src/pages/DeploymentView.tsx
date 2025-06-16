import { api } from "@/lib/api";
import { useParams } from "react-router-dom";

export const DeploymentView = () => {
  const params = useParams();
  const appId = parseInt(params.appId!);
  const deploymentId = parseInt(params.deploymentId!);

  const { data: deployment } = api.useSuspenseQuery(
    "get",
    "/app/{appId}/deployments/{deploymentId}",
    { params: { path: { appId, deploymentId } } },
  );

  return <>{JSON.stringify(deployment)}</>;
};
