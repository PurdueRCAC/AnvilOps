import { Logs } from "@/components/Logs";
import { api } from "@/lib/api";
import { ArrowLeft, Container, GitCommit } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { Status } from "./app/AppView";

export const DeploymentView = () => {
  const params = useParams();
  const appId = parseInt(params.appId!);
  const deploymentId = parseInt(params.deploymentId!);

  const { data: app } = api.useSuspenseQuery("get", "/app/{appId}", {
    params: { path: { appId } },
  });

  const { data: deployment } = api.useSuspenseQuery(
    "get",
    "/app/{appId}/deployments/{deploymentId}",
    { params: { path: { appId, deploymentId } } },
    {
      refetchInterval({ state: { data } }) {
        if (
          data?.status &&
          ["PENDING", "BUILDING", "DEPLOYING"].includes(data?.status)
        ) {
          return 2000;
        }
        return false;
      },
    },
  );
  console.log(deployment);

  const format = new Intl.DateTimeFormat(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });

  const title = deployment?.title?.trim() ?? "Untitled deployment";

  return (
    <main className="px-8 py-10">
      <Link
        className="flex items-center gap-1 opacity-50"
        to={`/app/${app.id}`}
      >
        <ArrowLeft size={16} />
        {app.displayName}
      </Link>
      <h1 className="text-3xl font-bold line-clamp-1" title={title}>
        {title}
      </h1>
      <div className="flex gap-4 z-30 py-2">
        <Status status={deployment.status} />
        {deployment.config.source === "git" && deployment.commitHash ? (
          <a
            className="flex gap-1"
            href={`${app.repositoryURL}/commit/${deployment.commitHash}`}
          >
            <GitCommit /> {deployment.commitHash.substring(0, 7)}
          </a>
        ) : deployment.config.source === "image" ? (
          <p className="flex items-center gap-1">
            <Container size={20} /> {deployment.config.imageTag}
          </p>
        ) : null}
      </div>
      <p className="opacity-50">
        Started at {format.format(new Date(deployment.createdAt))} &middot; Last
        updated {format.format(new Date(deployment.updatedAt))}.
      </p>
      <Logs deployment={deployment} type="BUILD" />
    </main>
  );
};
