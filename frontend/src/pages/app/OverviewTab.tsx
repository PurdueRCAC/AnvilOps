import { useAppConfig } from "@/components/AppConfigProvider";
import HelpTooltip from "@/components/HelpTooltip";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
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
import { toast } from "sonner";
import { Status, type App, type DeploymentStatus } from "./AppView";
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

  let subdomain = "";
  if (appDomain !== null) {
    const temp = new URL(appDomain);
    temp.hostname = app.subdomain + "." + temp.hostname;
    subdomain = temp.toString();
  }

  return (
    <>
      <RedeployModal
        isOpen={redeployOpen}
        setOpen={setRedeployOpen}
        deploymentId={redeployId!}
        app={app}
        onSubmitted={() => {
          refetchDeployments();
          refetchApp();
        }}
      />
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
        {appDomain !== null && app.config.createIngress && (
          <>
            <p className="flex items-center gap-2">
              <Link2 size={16} />
              Public address
            </p>
            <p>
              <a
                href={subdomain}
                className="underline flex gap-1 items-center"
                target="_blank"
                rel="noopener noreferrer"
              >
                {app.subdomain}.{appDomain?.hostname}
                <ExternalLink size={14} />
              </a>
            </p>
          </>
        )}
        <p className="flex items-center gap-2">
          <Network size={16} />
          Internal address
          <HelpTooltip size={16}>
            Other workloads within the cluster can communicate with your
            application using this address. <br />
            Use this address when possible for improved speed and compatibility
            with non-HTTP protocols.
            <br />
            End users cannot use this address, as it's only valid within the
            cluster.
          </HelpTooltip>
        </p>
        <p>
          anvilops-{app.subdomain}.anvilops-{app.subdomain}
          .svc.cluster.local
        </p>
      </div>
      <ToggleCDForm app={app} refetchApp={refetchApp} className="mt-4" />
      <h3 className="text-xl font-medium mt-8">Recent Deployments</h3>
      <p className="opacity-50 mb-2">
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
        <div className="flex gap-2 items-center text-black-4">
          <Loader className="animate-spin inline" />
          <span>Loading past deployments...</span>
        </div>
      ) : (
        <table className="w-full my-4 [&_:is(th,td):first-child]:pr-4 [&_:is(th,td):last-child]:pl-4 [&_:is(th,td):not(:first-child,:last-child)]:px-4">
          <thead>
            <tr className="*:text-start *:pb-2 *:font-medium border-b">
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
                    >
                      <span className="opacity-50 flex items-center gap-1">
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
                <td>
                  <Button
                    disabled={
                      d.id === activeDeployment ||
                      (d.status !== "COMPLETE" && d.status !== "STOPPED")
                    }
                    variant="outline"
                    className="cursor-pointer disabled:cursor-not-allowed"
                    onClick={async () => {
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
                  <div className="flex justify-center items-center gap-5">
                    <Button
                      variant="outline"
                      disabled={page == 0}
                      className="disabled:cursor-not-allowed"
                      onClick={() => {
                        setPage((page) => page - 1);
                        refetchDeployments();
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
                        refetchDeployments();
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

        toast.success("Updated app successfully.");
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
