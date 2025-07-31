import type { DeploymentInfo } from "@/components/DeploymentStatus";
import { Button } from "@/components/ui/button";
import type { components } from "@/generated/openapi";
import { useEventSource } from "@/hooks/useEventSource";
import { api } from "@/lib/api";
import {
  AlertTriangle,
  Check,
  ChevronsLeftRightEllipsis,
  CircleX,
  Clock,
  Cloud,
  Container,
  Flag,
  Hammer,
  Hourglass,
  Info,
  Loader,
  Trash2,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import type { App } from "./AppView";
import { format } from "./OverviewTab";

const timeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: undefined,
  timeStyle: "medium",
});

export const StatusTab = ({
  app,
  activeDeployment,
}: {
  app: App;
  activeDeployment: DeploymentInfo | undefined;
}) => {
  const [status, setStatus] = useState<
    components["schemas"]["AppStatus"] | null
  >(null);

  const { connecting, connected } = useEventSource(
    new URL(
      `${window.location.protocol}//${window.location.host}/api/app/${app.id}/status`,
    ),
    ["message"],
    (_, event) => {
      const data = event.data as string;
      setStatus(JSON.parse(data));
    },
  );

  const pods = status?.pods;
  const statefulSet = status?.statefulSet;
  const events = status?.events;

  const activePods = pods?.filter(
    (it) => it.deploymentId === activeDeployment?.id,
  );
  const oldPods = pods?.filter(
    (it) => it.deploymentId !== activeDeployment?.id,
  );

  const updating =
    statefulSet?.currentRevision !== statefulSet?.updateRevision ||
    statefulSet?.generation !== statefulSet?.observedGeneration;

  const {
    mutateAsync: deletePod,
    variables: podInDeletionProcess,
    isPending: podDeleting,
  } = api.useMutation("delete", "/app/{appId}/pods/{podName}");

  return (
    <>
      <h2 className="text-xl font-medium mb-2">
        Pods{" "}
        {statefulSet && (
          <span className="opacity-50">
            ({statefulSet?.readyReplicas ?? 0}/{statefulSet?.replicas ?? 0}{" "}
            ready)
          </span>
        )}
      </h2>
      {connecting ? (
        <p className="flex items-center gap-2 text-sm mb-4">
          <Loader className="animate-spin" /> Connecting...
        </p>
      ) : !connected ? (
        <p className="text-amber-600 flex items-center gap-2 text-sm mb-4">
          <AlertTriangle /> Disconnected. Status changes will not appear until
          the connection is re-established.
        </p>
      ) : (
        <p className="text-blue-500 flex items-center gap-2 text-sm mb-4">
          <span className="relative block w-4 h-5">
            <span className="absolute block top-1/2 left-1/2 -translate-1/2 size-2 rounded-full bg-blue-500 animate-pulse" />
            <span className="absolute block top-1/2 left-1/2 -translate-1/2 size-2 rounded-full bg-blue-500 animate-ping" />
          </span>
          Updating in realtime
        </p>
      )}
      <p className="opacity-50">
        Each instance of your app runs in a Pod. When you initiate a new
        deployment, the new pods are created with the updated configuration, the
        load balancer switches to target the new pods, and then the old pods are
        shut down.
      </p>
      {updating && (
        <div className="bg-blue-100 rounded-md p-4 border border-blue-50 my-4">
          <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
            <Loader className="animate-spin" /> Update In Progress (
            {statefulSet?.updatedReplicas
              ? statefulSet.replicas! - statefulSet.updatedReplicas
              : (statefulSet?.readyReplicas ?? 0)}
            /{statefulSet?.replicas})
          </h3>
          <p>New pods are being created to replace old ones.</p>
        </div>
      )}
      {events?.map((event) => <EventInfo event={event} />)}
      {connecting ? null : !pods || pods.length === 0 ? (
        <div className="bg-gray-50 rounded-md p-4 my-4">
          <p className="flex items-center gap-2">
            <Container /> No Pods Found
          </p>
          <p className="opacity-50 ml-8">
            Pods will be created automatically when you deploy your app. Try
            pushing to your Git repo or updating your settings in the
            Configuration tab.
          </p>
        </div>
      ) : (
        <>
          {oldPods && oldPods.length > 0 ? (
            <h3 className="mt-8">Active Deployment</h3>
          ) : null}
          {activePods && activePods.length > 0 ? (
            activePods?.map((pod) => <PodInfo pod={pod} key={pod.id} />)
          ) : (
            <p className="mt-2 opacity-50">
              There are no pods from the current deployment.
            </p>
          )}

          {oldPods && oldPods.length > 0 ? (
            <>
              <h3 className="mt-8">Previous Deployments</h3>
              {oldPods?.map((pod) => (
                <PodInfo pod={pod} key={pod.id}>
                  {(updating && containerState(pod, "terminated")) ||
                  containerState(pod, "waiting") ? (
                    <>
                      <hr className="my-4" />
                      <p className="mb-2">
                        If this pod is taking too long to update, consider
                        deleting it. Pods will only be removed when they are
                        running successfully, so if you made a configuration
                        change that fixes a crash loop, you will need to delete
                        this pod for the change to take effect.
                      </p>
                      <Button
                        variant="destructive"
                        disabled={
                          podDeleting &&
                          podInDeletionProcess?.params?.path?.podName ===
                            pod.name
                        }
                        onClick={async () => {
                          await deletePod({
                            params: {
                              path: { appId: app.id, podName: pod.name! },
                            },
                          });
                        }}
                      >
                        {podDeleting &&
                        podInDeletionProcess?.params?.path?.podName ===
                          pod.name ? (
                          <Loader className="animate-spin" />
                        ) : (
                          <Trash2 />
                        )}
                        Delete Pod
                      </Button>
                    </>
                  ) : null}
                </PodInfo>
              ))}
            </>
          ) : null}
        </>
      )}
    </>
  );
};

type Event = NonNullable<components["schemas"]["AppStatus"]["events"]>[0];

const EventInfo = ({ event }: { event: Event }) => {
  return (
    <p className="bg-orange-100 rounded-md p-4 border border-orange-50 my-4">
      <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
        <Flag className="animate-spin" /> Warning
      </h3>
      <p className="opacity-50 text-sm">
        Occurred {event.count} times since{" "}
        {format.format(new Date(event.firstTimestamp!))}, most recently at{" "}
        {format.format(new Date(event.lastTimestamp!))}.
      </p>
      <p>There may be an issue deploying your app. {event.message}</p>
    </p>
  );
};

type Pod = NonNullable<components["schemas"]["AppStatus"]["pods"]>[0];

const PodInfo = ({ pod, children }: { pod: Pod; children?: ReactNode }) => {
  return (
    <div className="my-4 border-input rounded-md p-4 border">
      <div className="flex justify-between">
        <div>
          <h3 className="text-xl font-medium">{pod.name}</h3>
          <p className="text-sm opacity-50 mb-2">
            Created at {pod.createdAt && format.format(new Date(pod.createdAt))}
          </p>
          <PodStatusText pod={pod} />
        </div>
        <div className="grid grid-cols-[max-content_1fr] gap-2 opacity-50 text-sm items-center h-max">
          {pod.node && (
            <>
              <Cloud /> {pod.node}
            </>
          )}
          {pod.ip && (
            <>
              <ChevronsLeftRightEllipsis /> {pod.ip}{" "}
            </>
          )}
        </div>
      </div>
      {children ? <div className="">{children}</div> : null}
    </div>
  );
};

const PodStatusText = ({ pod }: { pod: Pod }) => {
  const waiting = containerState(pod, "waiting");
  const running = containerState(pod, "running");
  const terminated = containerState(pod, "terminated");

  if (waiting) {
    switch (waiting.reason) {
      case "CrashLoopBackOff":
        return (
          <>
            <p className="text-red-500 flex items-center gap-2 mb-2">
              <CircleX /> Error
            </p>
            <p>
              This container is crashing repeatedly. It will be restarted{" "}
              {getRestartTime(pod)}.
            </p>
            {lastState(pod, "terminated")?.finishedAt && (
              <p className="mt-1">
                It most recently exited at{" "}
                {timeFormat.format(
                  new Date(lastState(pod, "terminated")!.finishedAt!),
                )}{" "}
                with status code {lastState(pod, "terminated")?.exitCode}.
              </p>
            )}
          </>
        );
      case "ErrImagePull":
      case "ImagePullBackOff":
        return (
          <>
            <p className="text-red-500 flex items-center gap-2 mb-2">
              <CircleX /> Error
            </p>
            <p>
              Can't pull the container image. Make sure the image name is
              spelled correctly and the registry is publicly accessible.
            </p>
          </>
        );
      case "InvalidImageName":
        return (
          <>
            <p className="text-red-500 flex items-center gap-2 mb-2">
              <CircleX /> Error
            </p>
            <p>Invalid image name. Make sure it is spelled correctly.</p>
          </>
        );
      case "CreateContainerConfigError":
        return (
          <>
            <p className="text-red-500 flex items-center gap-2 mb-2">
              <CircleX /> Error
            </p>
            <p>
              There is something wrong with the container's configuration:{" "}
              {waiting.message}.
            </p>
          </>
        );
      case "ContainerCreating":
        return (
          <p className="text-blue-500 flex items-center gap-2 mb-2">
            <Hammer /> Container Creating
          </p>
        );
      default:
        return (
          <>
            <p className="text-amber-600 flex items-center gap-2 mb-2">
              <CircleX /> Waiting to start
            </p>
            <p>Additional information:</p>
            <ul className="list-disc ml-4">
              <li>
                Reason:{" "}
                {waiting.reason ? <code>{waiting.reason}</code> : <i>None</i>}
              </li>
              <li>
                Message:{" "}
                {waiting.message ? <code>{waiting.message}</code> : <i>None</i>}
              </li>
            </ul>
          </>
        );
    }
  }

  if (terminated) {
    if (terminated.reason === "Success" || terminated.exitCode === 0) {
      return (
        <>
          <p className="text-blue-500 flex items-center gap-2 mb-2">
            <Info /> Terminated
          </p>
          <p>This container has stopped gracefully. It will be removed soon.</p>
        </>
      );
    } else {
      return (
        <>
          <p className="text-red-500 flex items-center gap-2 mb-2">
            <CircleX /> Error
          </p>
          <p>This container has crashed. It will be restarted soon.</p>
        </>
      );
    }
  }

  if (running) {
    return (
      <p className="text-green-500 flex items-center gap-2">
        <Check /> Ready
      </p>
    );
  }

  if (pod.podScheduled) {
    return (
      <p className="text-amber-600 flex items-center gap-2">
        <Clock /> Scheduled
      </p>
    );
  }

  return (
    <p className="text-orange-500 flex items-center gap-2">
      <Hourglass />
      Pending
    </p>
  );
};

// https://stackoverflow.com/a/50375286
type UnionToIntersection<U> = (U extends any ? (x: U) => void : never) extends (
  x: infer I,
) => void
  ? I
  : never;

type AllContainerStates = UnionToIntersection<
  NonNullable<components["schemas"]["ContainerState"]>
>;

function containerState<K extends keyof AllContainerStates>(
  pod: Pod,
  type: K,
): AllContainerStates[K] | undefined {
  if (!pod.containerState) return undefined;
  return getState(pod.containerState, type);
}

function lastState<K extends keyof AllContainerStates>(
  pod: Pod,
  type: K,
): AllContainerStates[K] | undefined {
  if (!pod.lastState) return undefined;
  return getState(pod.lastState, type);
}

function getState<K extends keyof AllContainerStates>(
  obj: components["schemas"]["ContainerState"],
  type: K,
): AllContainerStates[K] | undefined {
  if (!obj) {
    return undefined;
  }
  if (type === "running" && "running" in obj) {
    return obj["running"];
  }
  if (type === "terminated" && "terminated" in obj) {
    return obj["terminated"];
  }
  if (type === "waiting" && "waiting" in obj) {
    return obj["waiting"];
  }
}

/**
 * Takes a CrashLoopBackOff message and returns the amount of time that the kubelet is waiting before restarting the container.
 */
function getRestartTime(pod: Pod) {
  if (!pod.containerState || !("waiting" in pod.containerState)) {
    return "soon";
  }

  const message = pod.containerState.waiting?.message!;

  // Example: "back-off 5m0s restarting failed container=minecraft-server pod=minecraft-server-0_anvilops-mc(7ee242c3-6eaa-4331-8476-0fea4d944809)"
  const result = /back-off (.*) restarting failed/.exec(message);
  if (!result || result.length !== 2) {
    return undefined;
  }

  const [, duration] = result;
  const ms = parseGoDuration(duration);

  const lastCrashTime =
    pod.lastState && "terminated" in pod.lastState
      ? new Date(pod.lastState?.terminated?.finishedAt!).getTime()
      : undefined;

  if (lastCrashTime) {
    return "at " + timeFormat.format(new Date(lastCrashTime + ms));
  } else {
    return "in " + result;
  }
}

/**
 * Parses a Golang Duration string into a number of milliseconds
 */
function parseGoDuration(input: string) {
  const regex = /(\d+\.?\d*)(ms|s|m|h)(.*)/;
  let ms = 0;
  const units: Record<string, number> = {
    ns: 1 / 1000000,
    us: 1 / 1000,
    μs: 1 / 1000,
    ms: 1,
    s: 1000,
    m: 60000,
    h: 3600000,
  };
  while (true) {
    const result = regex.exec(input);
    if (!result) return ms;
    const [, amount, unit, next] = result;
    input = next;
    ms += +amount * units[unit];
    if (input === "") return ms;
  }
}
