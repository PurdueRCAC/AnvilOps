import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { api } from "@/lib/api";
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
  Tag,
  Undo2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { GitHubIcon } from "@/pages/create-app/CreateAppView";
import { Status, type App, type DeploymentStatus } from "./AppView";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  AppConfigDiff,
  type DeploymentConfigFormData,
} from "./diff/AppConfigDiff";
import { cn } from "@/lib/utils";

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
  } = api.useSuspenseQuery(
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

  const [redeployState, setRedeployState] = useState<{
    open: boolean;
    configOpen: boolean;
    configState: DeploymentConfigFormData;
    id: number | undefined;
  }>({
    open: false,
    configOpen: false,
    configState: {
      replicas: "",
      env: [],
      source: "git",
      builder: "dockerfile",
      port: "",
    },
    id: undefined,
  });

  const { data: pastDeployment, isPending: pastDeploymentLoading } =
    api.useQuery(
      "get",
      "/app/{appId}/deployments/{deploymentId}",
      { params: { path: { appId: app.id, deploymentId: redeployState.id! } } },
      { enabled: redeployState.open && !!redeployState.id },
    );

  useEffect(() => {
    if (!pastDeploymentLoading && pastDeployment) {
      setRedeployState((rs) => ({
        ...rs,
        configState: {
          orgId: app.orgId,
          ...pastDeployment.config,
          port: pastDeployment.config.port.toString(),
          replicas: pastDeployment.config.replicas.toString(),
          ...(pastDeployment.config.source === "git"
            ? {
                builder: pastDeployment.config.builder,
                eventId: pastDeployment.config.eventId?.toString() ?? undefined,
              }
            : {
                builder: "dockerfile",
                eventId: undefined,
              }),
        },
      }));
    }
  }, [pastDeploymentLoading]);

  const id = app.config.source === "git" ? app.config.eventId : null;
  const workflow = useMemo(
    () => workflows?.workflows?.find((workflow) => workflow.id === id),
    [workflows],
  );

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

  return (
    <>
      <Dialog
        open={redeployState.open}
        onOpenChange={(open) => setRedeployState((s) => ({ ...s, open }))}
      >
        <DialogContent
          className={cn(
            "duration-300",
            redeployState.configOpen && "h-5/6 overflow-auto sm:max-w-4xl",
          )}
        >
          <DialogHeader>
            <DialogTitle>Reuse This Deployment</DialogTitle>
          </DialogHeader>
          <form className="space-y-1">
            {!redeployState.configOpen ? (
              <>
                <ul className="list-none space-y-2">
                  <li>
                    <Label>
                      <Checkbox />
                      Redeploy this version of the application
                    </Label>
                    {true && (
                      <ul className="list-none ml-10 mt-2">
                        <Label>
                          <Checkbox />
                          Also suspend automatic redeployments
                        </Label>
                      </ul>
                    )}
                  </li>
                  <li>
                    <Label>
                      <Checkbox />
                      <p>Reuse this configuration</p>
                    </Label>
                  </li>
                </ul>
                <Button
                  variant="secondary"
                  className="w-full font-bold my-2"
                  type="button"
                  onClick={() =>
                    setRedeployState((s) => ({ ...s, configOpen: true }))
                  }
                >
                  Review configuration
                </Button>
                <Button className="w-full" type="submit">
                  Deploy
                </Button>
              </>
            ) : (
              <>
                <AppConfigDiff
                  orgId={app.orgId}
                  base={{
                    ...app.config,
                    replicas: app.config.replicas.toString(),
                    port: app.config.port.toString(),
                    ...(app.config.source === "git"
                      ? {
                          builder: app.config.builder,
                          eventId: app.config.eventId?.toString() ?? undefined,
                        }
                      : {
                          builder: "dockerfile",
                          eventId: undefined,
                        }),
                  }}
                  state={redeployState.configState}
                  setState={(
                    updateConfig: (
                      s: DeploymentConfigFormData,
                    ) => DeploymentConfigFormData,
                  ) => {
                    setRedeployState((rs) => ({
                      ...rs,
                      configState: updateConfig(rs.configState),
                    }));
                  }}
                  defaults={{ config: pastDeployment?.config }}
                />
                <Button
                  className="float-right"
                  type="button"
                  onClick={() =>
                    setRedeployState((rs) => ({ ...rs, configOpen: false }))
                  }
                >
                  Use this configuration
                </Button>
              </>
            )}
          </form>
        </DialogContent>
      </Dialog>
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
            className="underline flex gap-1 items-center w-fit"
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
            Automatically triggered by {deployTrigger}
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
                        {d.commitHash?.substring(0, 7) ?? "Unknown"}
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
                {d.id !== activeDeployment && (
                  <td>
                    <button
                      className="cursor-pointer"
                      onClick={() =>
                        setRedeployState((rs) => ({
                          open: true,
                          configOpen: false,
                          configState: rs.configState,
                          id: d.id,
                        }))
                      }
                    >
                      <Undo2 className="text-black-2 hover:text-black-3" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
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
        </table>
      )}
    </>
  );
};
