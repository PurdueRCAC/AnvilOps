import type { paths } from "@/generated/openapi";
import { api } from "@/lib/api";
import { FileClock, SatelliteDish } from "lucide-react";

type Deployment =
  paths["/app/{appId}/deployments/{deploymentId}"]["get"]["responses"]["200"]["content"]["application/json"];

type LogType = Exclude<
  paths["/app/{appId}/deployments/{deploymentId}/logs"]["get"]["parameters"]["query"],
  undefined
>["type"];

export const Logs = ({
  deployment,
  type,
}: {
  deployment: Pick<Deployment, "status" | "id" | "appId" | "updatedAt">;
  type: LogType;
}) => {
  const { data: logs } = api.useSuspenseQuery(
    "get",
    "/app/{appId}/deployments/{deploymentId}/logs",
    {
      params: {
        path: { appId: deployment.appId, deploymentId: deployment.id },
        query: { type },
      },
    },
    {
      refetchInterval() {
        if (type === "RUNTIME" && deployment?.status === "COMPLETE") {
          return 4000;
        }
        if (
          deployment?.status === "BUILDING" &&
          new Date(deployment.updatedAt).getTime() >
            new Date().getTime() - 5 * 60_000
        ) {
          // If the image is building and has only been building for up to 5 minutes, fetch every 1 second
          return 1000;
        }
        if (
          deployment?.status &&
          ["PENDING", "BUILDING", "DEPLOYING"].includes(deployment?.status)
        ) {
          return 3000;
        }
        return false;
      },
    },
  );

  return (
    <div className="bg-gray-100 font-mono w-full rounded-md my-4 p-4 overflow-x-scroll">
      {logs?.logs && logs.logs.length > 0 ? (
        <pre>
          {logs?.logs?.map((log) => (
            <p key={log.id}>
              <span className="opacity-50">{log.time}</span> {log.log}
            </p>
          ))}
        </pre>
      ) : type === "BUILD" ? (
        <>
          <p className="flex gap-2 text-lg font-medium">
            <SatelliteDish /> Logs Unavailable
          </p>
          <p className="opacity-50 ml-8">
            {["PENDING", "BUILDING"].includes(deployment.status)
              ? "Waiting for the build to start."
              : "Build logs expire after a few hours."}
          </p>
        </>
      ) : (
        <>
          <p className="flex gap-2 text-lg font-medium">
            <FileClock /> No Logs Found
          </p>
          <p className="opacity-50 ml-8">
            {["PENDING", "BUILDING", "DEPLOYING"].includes(deployment.status)
              ? "Waiting for your app to be deployed."
              : "Logs from your app will appear here."}
          </p>
        </>
      )}
    </div>
  );
};
