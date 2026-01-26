import { useAppConfig } from "@/components/AppConfigProvider";
import HelpTooltip from "@/components/HelpTooltip";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/lib/api";
import { cn, isWorkloadConfig } from "@/lib/utils";
import { GitHubIcon } from "@/pages/create-app/CreateAppView";
import {
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Container,
  ExternalLink,
  GitBranch,
  GitCommit,
  Link2,
  Loader,
  LogsIcon,
  Network,
  Tag,
  Undo2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Status, type App } from "./AppView";
import { RedeployModal } from "./overview/RedeployModal";

export const format = new Intl.DateTimeFormat(undefined, {
  dateStyle: "short",
  timeStyle: "medium",
});

export const OverviewTab = ({
  app,
  activeDeployment,
  refetch: refetchApp,
}: {
  app: App;
  activeDeployment: number | undefined;
  refetch: () => void;
}) => {
  const [page, setPage] = useState(0);
  const pageLength = 25;
  const {
    data: deployments,
    isPending,
    refetch: refetchDeployments,
  } = api.useQuery(
    "get",
    "/app/{appId}/deployments",
    {
      params: {
        path: { appId: app.id },
        query: { page, length: pageLength },
      },
    },
    {
      refetchInterval: ({ state: { data } }) => {
        if (!data) return false;
        switch (data?.[0]?.status) {
          case "QUEUED":
            if (
              new Date().getTime() - new Date(data?.[0]?.createdAt).getTime() <
              10_000
            ) {
              return 1_000;
            } else {
              return 5_000;
            }
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

  const { data: workflows } = api.useQuery(
    "get",
    "/org/{orgId}/repos/{repoId}/workflows",
    {
      params: {
        path: {
          orgId: app.orgId,
          repoId: app.config.source === "git" ? app.config.repositoryId : -1,
        },
      },
    },
    {
      enabled:
        app.config.source === "git" && app.config.event === "workflow_run",
      refetchIntervalInBackground: false,
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
    },
  );

  const workflow = useMemo(() => {
    if (app.config.source === "git") {
      const id = app.config.eventId;
      return workflows?.workflows?.find((workflow) => workflow.id === id);
    }
  }, [workflows, app.config.source]);

  useEffect(() => {
    // When the first deployment's status changes to Complete, refetch the app to update the "current" deployment
    if (deployments?.[0]?.status === "COMPLETE") {
      refetchApp();
    }
  }, [deployments?.[0]?.status]);

  let deployTrigger = null;
  if (app.config.source === "git") {
    deployTrigger =
      app.config.event === "workflow_run" ? (
        <span>
          {" successful runs of "}
          {!workflow ? (
            " a workflow "
          ) : (
            <a
              href={`${app.repositoryURL}/tree/${app.config.branch}/${workflow.path}`}
              target="_blank"
              className="underline"
              rel="noreferrer"
            >
              {workflow.name}
            </a>
          )}
          {" on "}
        </span>
      ) : (
        <span>{" pushes to "}</span>
      );
  }

  const [redeployOpen, setRedeployOpen] = useState(false);
  const [redeployId, setRedeployId] = useState<number | undefined>(undefined);

  const appDomain = URL.parse(useAppConfig()?.appDomain ?? "");

  return (
    <>
      <RedeployModal
        isOpen={redeployOpen}
        setOpen={setRedeployOpen}
        deploymentId={redeployId!}
        app={app}
        onSubmitted={() => {
          void refetchDeployments();
          refetchApp();
        }}
      />
      <h3 className="mb-4 text-xl font-medium">General</h3>
      <div className="grid max-w-max grid-cols-[repeat(2,max-content)] gap-x-8 gap-y-4">
        {app.config.source === "git" ? (
          <>
            <p className="flex items-center gap-2">
              <GitHubIcon className="size-4" />
              Git repository
            </p>
            <p>
              <a
                href={app.repositoryURL}
                className="flex items-center gap-1 underline"
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
        {appDomain !== null &&
          isWorkloadConfig(app.config) &&
          app.config.createIngress && (
            <>
              <p className="flex items-center gap-2">
                <Link2 size={16} />
                Public address
              </p>
              <p>
                <a
                  href={(() => {
                    const temp = new URL(appDomain);
                    temp.hostname = app.config.subdomain + "." + temp.hostname;
                    return temp.toString();
                  })()}
                  className="flex items-center gap-1 underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {app.config.subdomain}.{appDomain?.hostname}
                  <ExternalLink size={14} />
                </a>
              </p>
            </>
          )}
        {isWorkloadConfig(app.config) && (
          <>
            <p className="flex items-center gap-2">
              <Network size={16} />
              Internal address
              <HelpTooltip size={16}>
                Other workloads within the cluster can communicate with your
                application using this address. <br />
                Use this address when possible for improved speed and
                compatibility with non-HTTP protocols.
                <br />
                End users cannot use this address, as it&apos;s only valid
                within the cluster.
              </HelpTooltip>
            </p>
            <p>
              {app.namespace}.{app.namespace}
              .svc.cluster.local
            </p>
          </>
        )}
      </div>
      <ToggleCDForm app={app} refetchApp={refetchApp} className="mt-4" />
      <h3 className="mt-8 text-xl font-medium">Recent Deployments</h3>
      <p className="mb-2 opacity-50">
        {app.config.source === "git" && app.cdEnabled ? (
          <>
            Automatically triggered by {deployTrigger}
            <a href={`${app.repositoryURL}/tree/${app.config.branch}`}>
              <GitBranch className="inline" size={16} />{" "}
              <code>{app.config.branch}</code>
            </a>
            .
          </>
        ) : null}
      </p>
      {isPending ? (
        <div className="text-black-4 flex items-center gap-2">
          <Loader className="inline animate-spin" />
          <span>Loading past deployments...</span>
        </div>
      ) : (
        <table className="my-4 w-full border-b [&_:is(th,td):first-child]:pr-4 [&_:is(th,td):last-child]:pl-4 [&_:is(th,td):not(:first-child,:last-child)]:px-4">
          <thead>
            <tr className="border-b *:pb-2 *:text-start *:font-medium">
              <th>Created</th>
              <th>Source</th>
              <th>Status</th>
              <th>Logs</th>
              <th>Rollback</th>
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
                    {d.id === activeDeployment ? (
                      <Tooltip>
                        <TooltipTrigger>
                          <span
                            className="flex items-center gap-2 rounded-full bg-green-500 px-2 py-1 text-xs text-white"
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
                    ) : (
                      // Reduce layout shift when the "Current" badge loads in by reserving the space
                      <span className="w-20" />
                    )}
                  </div>
                </td>
                <td>
                  {d.source === "GIT" ? (
                    <a
                      href={`${d.repositoryURL}/commit/${d.commitHash}`}
                      target="_blank"
                      className="flex items-center gap-2"
                      rel="noreferrer"
                    >
                      <span className="flex items-center gap-1 opacity-50">
                        <GitCommit className="shrink-0" />
                        {d.commitHash?.substring(0, 7) ?? "Unknown"}
                      </span>
                      <span className="line-clamp-1" title={d.commitMessage}>
                        {d.commitMessage}
                      </span>
                    </a>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger>
                        <p className="flex items-center gap-2">
                          <Container />{" "}
                          <span className="max-w-96 truncate">
                            {d.imageTag}
                          </span>
                        </p>
                      </TooltipTrigger>
                      <TooltipContent>{d.imageTag}</TooltipContent>
                    </Tooltip>
                  )}
                </td>
                <td>
                  <Status status={d.status} />
                </td>
                <td className="py-2">
                  <Link to={`/app/${app.id}/deployment/${d.id}`}>
                    <Button size="icon" variant="secondary">
                      <LogsIcon />
                    </Button>
                  </Link>
                </td>
                <td>
                  <Button
                    disabled={
                      d.id === activeDeployment ||
                      (d.status !== "COMPLETE" && d.status !== "STOPPED")
                    }
                    variant="outline"
                    className="cursor-pointer disabled:cursor-not-allowed"
                    onClick={() => {
                      setRedeployOpen(true);
                      setRedeployId(d.id);
                    }}
                  >
                    <Undo2 className="text-black-2 hover:text-black-3" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
          {app.deploymentCount > pageLength && (
            <tfoot>
              <tr>
                <td colSpan={4}>
                  <div className="flex items-center justify-center gap-5">
                    <Button
                      variant="outline"
                      disabled={page == 0}
                      className="disabled:cursor-not-allowed"
                      onClick={() => {
                        setPage((page) => page - 1);
                        void refetchDeployments();
                      }}
                    >
                      <ChevronLeft />
                    </Button>
                    <p className="text-black-2 text-center">
                      Showing {page * pageLength + 1} to{" "}
                      {Math.min(
                        app.deploymentCount,
                        page * pageLength + pageLength,
                      )}{" "}
                      of {app.deploymentCount}
                    </p>
                    <Button
                      variant="outline"
                      disabled={
                        page * pageLength + pageLength >= app.deploymentCount
                      }
                      className="disabled:cursor-not-allowed"
                      onClick={() => {
                        setPage((page) => page + 1);
                        void refetchDeployments();
                      }}
                    >
                      <ChevronRight />
                    </Button>
                  </div>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      )}
    </>
  );
};

const ToggleCDForm = ({
  app,
  refetchApp,
  className,
}: {
  app: App;
  refetchApp: () => void;
  className?: string;
}) => {
  const { mutateAsync: setAppCD, isPending } = api.useMutation(
    "put",
    "/app/{appId}/cd",
  );

  if (app.config.source !== "git") {
    return null;
  }

  return (
    <form
      className={cn(className, "space-y-1")}
      onSubmit={async (e) => {
        e.preventDefault();

        await setAppCD({
          params: {
            path: { appId: app.id },
          },
          body: { enable: !app.cdEnabled },
        });

        refetchApp();
      }}
    >
      <p>
        Continuous deployment is{" "}
        {app.cdEnabled ? <strong>on.</strong> : <strong>off.</strong>}{" "}
      </p>
      <p className="text-black-3">
        This app {app.cdEnabled ? "will" : "will not"} be rebuilt and redeployed
        when new changes are pushed to the {app.config.branch} branch of the
        connected repository.
      </p>
      <Button>
        {isPending ? (
          <>
            <Loader className="animate-spin" /> Saving...
          </>
        ) : (
          <>{app.cdEnabled ? "Stop" : "Start"} continuous deployment</>
        )}
      </Button>
    </form>
  );
};
