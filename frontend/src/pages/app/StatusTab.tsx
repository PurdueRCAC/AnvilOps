import type { DeploymentInfo } from "@/components/DeploymentStatus";
import type { components, paths } from "@/generated/openapi";
import { api } from "@/lib/api";
import {
  Check,
  CircleX,
  Clock,
  Container,
  Hourglass,
  Info,
} from "lucide-react";
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
  const { data: pods } = api.useQuery(
    "get",
    "/app/{appId}/pods",
    {
      params: { path: { appId: app.id } },
    },
    { refetchInterval: 4_000 },
  );

  const activePods = pods?.filter(
    (it) => it.deploymentId === activeDeployment?.id,
  );
  const oldPods = pods?.filter(
    (it) => it.deploymentId !== activeDeployment?.id,
  );

  return (
    <>
      <h2 className="text-xl font-medium mb-4">Pods</h2>
      <p className="opacity-50">
        Each instance of your app runs in a Pod. When you initiate a new
        deployment, the new pods are created with the updated configuration, the
        load balancer switches to target the new pods, and then the old pods are
        shut down.
      </p>
      {!pods || pods.length === 0 ? (
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
              {oldPods?.map((pod) => <PodInfo pod={pod} key={pod.id} />)}
            </>
          ) : null}
        </>
      )}
    </>
  );
};

type Pod =
  paths["/app/{appId}/pods"]["get"]["responses"]["200"]["content"]["application/json"][0];

const PodInfo = ({ pod }: { pod: Pod }) => {
  return (
    <div className="my-4 border-input rounded-md p-4 border" key={pod.id}>
      <h3 className="text-xl font-medium">{pod.name}</h3>
      <p className="text-sm opacity-50 mb-2">
        Created at {pod.createdAt && format.format(new Date(pod.createdAt))}
      </p>
      {containerState(pod, "waiting")?.reason === "CrashLoopBackOff" ? (
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
      ) : containerState(pod, "terminated") ? (
        <>
          {containerState(pod, "terminated")?.exitCode === 0 ? (
            <>
              <p className="text-blue-500 flex items-center gap-2 mb-2">
                <Info /> Terminated
              </p>
              <p>
                This container has stopped gracefully. It will be removed soon.
              </p>
            </>
          ) : (
            <>
              <p className="text-red-500 flex items-center gap-2 mb-2">
                <CircleX /> Error
              </p>
              <p>This container has crashed. It will be restarted soon.</p>
            </>
          )}
        </>
      ) : containerState(pod, "running") || pod.podReady ? (
        <p className="text-green-500 flex items-center gap-2">
          <Check /> Ready
        </p>
      ) : pod.podScheduled ? (
        <p className="text-amber-600 flex items-center gap-2">
          <Clock /> Scheduled
        </p>
      ) : (
        <p className="text-yellow-500 flex items-center gap-2">
          <Hourglass />
          Pending
        </p>
      )}
    </div>
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
