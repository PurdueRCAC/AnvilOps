import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/lib/api";
import {
  CheckCheck,
  Container,
  ExternalLink,
  GitBranch,
  GitCommit,
  Link2,
  Loader,
  LogsIcon,
  Tag,
} from "lucide-react";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { GitHubIcon } from "../CreateAppView";
import { Status, type App, type DeploymentStatus } from "./AppView";

export const OverviewTab = ({
  app,
  activeDeployment,
  refetch: refetchApp,
}: {
  app: App;
  activeDeployment: number | undefined;
  refetch: () => void;
}) => {
  const { data: deployments, isPending } = api.useSuspenseQuery(
    "get",
    "/app/{appId}/deployments",
    { params: { path: { appId: app.id } } },
    {
      refetchInterval: ({ state: { data } }) => {
        if (!data) return false;
        switch (data?.[0]?.status) {
          case "PENDING":
            return 1_000;
          case "BUILDING":
            return 5_000;
          case "DEPLOYING":
            return 1_000;
          default:
            return 30_000;
        }
      },
    },
  );

  const { data: status } = api.useQuery("get", "/app/{appId}/pods", {
    params: { path: { appId: app.id } },
  });

  useEffect(() => {
    // When the first deployment's status changes to Complete, refetch the app to update the "current" deployment
    if (deployments?.[0]?.status === "COMPLETE") {
      refetchApp();
    }
  }, [deployments?.[0]?.status]);

  const format = new Intl.DateTimeFormat(undefined, {
    dateStyle: "short",
    timeStyle: "medium",
  });

  return (
    <>
      <h3 className="text-xl font-medium mb-4">General</h3>
      <div className="grid grid-cols-[repeat(2,max-content)] gap-x-8 gap-y-4 max-w-max">
        {app.config.source === "git" ? (
          <>
            <p className="flex items-center gap-2">
              <GitHubIcon className="size-4" />
              Git repository
            </p>
            <p>
              <a
                href={app.repositoryURL}
                className="underline flex gap-1 items-center"
                target="_blank"
                rel="noopener noreferrer"
              >
                {URL.parse(app.repositoryURL!)?.pathname?.substring(1)}
                <ExternalLink size={14} />
              </a>
            </p>
          </>
        ) : app.config.source === "image" ? (
          <>
            <p className="flex items-center gap-2">
              <Tag className="size-4" />
              Image tag
            </p>
            <p>{app.config.imageTag}</p>
          </>
        ) : null}
        <p className="flex items-center gap-2">
          <Link2 size={16} />
          Subdomain
        </p>
        <p>
          <a
            href={`https://${app.subdomain}.anvilops.rcac.purdue.edu`}
            className="underline flex gap-1 items-center"
            target="_blank"
            rel="noopener noreferrer"
          >
            {app.subdomain}.anvilops.rcac.purdue.edu
            <ExternalLink size={14} />
          </a>
        </p>
      </div>
      <h3 className="text-xl font-medium mt-8">Recent Deployments</h3>
      <p className="opacity-50 mb-2">
        {app.config.source === "git" ? (
          <>
            Automatically triggered from pushes to{" "}
            <a href={`${app.repositoryURL}/tree/${app.config.branch}`}>
              <GitBranch className="inline" size={16} />{" "}
              <code>{app.config.branch}</code>
            </a>
            .
          </>
        ) : null}
      </p>
      {isPending && deployments === undefined ? (
        <Loader className="animate-spin" />
      ) : (
        <table className="w-full my-4 [&_:is(th,td):first-child]:pr-4 [&_:is(th,td):last-child]:pl-4 [&_:is(th,td):not(:first-child,:last-child)]:px-4">
          <thead>
            <tr className="*:text-start *:pb-2 *:font-medium border-b">
              <th>Created</th>
              <th>Source</th>
              <th>Status</th>
              <th>Logs</th>
            </tr>
          </thead>
          <tbody>
            {deployments?.map((d) => (
              <tr key={d.id}>
                <td>
                  <div className="flex items-center gap-2">
                    <span className="text-nowrap">
                      {format.format(new Date(d.createdAt))}
                    </span>
                    {d.id === activeDeployment && (
                      <Tooltip>
                        <TooltipTrigger>
                          <span
                            className="flex items-center gap-2 bg-green-500 rounded-full px-2 py-1 text-xs text-white"
                            title=""
                          >
                            <CheckCheck size={14} /> Current
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-md">
                          Your domain points to this deployment. New deployments
                          become current once the app is built and the changes
                          are rolled out.
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </td>
                <td>
                  {d.source === "GIT" ? (
                    <a
                      href={`${app.repositoryURL}/commit/${d.commitHash}`}
                      className="flex items-center gap-2"
                    >
                      <span className="opacity-50 flex items-center gap-1">
                        <GitCommit className="shrink-0" />
                        {d.commitHash?.substring(0, 7)}
                      </span>
                      {d.commitMessage}
                    </a>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger>
                        <p className="flex items-center gap-2">
                          <Container />{" "}
                          <span className="truncate max-w-96">
                            {d.imageTag}
                          </span>
                        </p>
                      </TooltipTrigger>
                      <TooltipContent>{d.imageTag}</TooltipContent>
                    </Tooltip>
                  )}
                </td>
                <td>
                  <Status status={d.status as DeploymentStatus} />
                </td>
                <td className="py-2">
                  <Link to={`/app/${app.id}/deployment/${d.id}`}>
                    <Button size="icon" variant="secondary">
                      <LogsIcon />
                    </Button>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h3 className="text-xl font-medium mb-4">Status</h3>
      <pre>
        <code>{JSON.stringify(status, null, 2)}</code>
      </pre>
    </>
  );
};
