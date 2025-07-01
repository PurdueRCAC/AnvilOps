import type { components, paths } from "@/generated/openapi";
import { useEventSource } from "@/hooks/useEventSource";
import { AlertTriangle, FileClock, SatelliteDish } from "lucide-react";
import { useState } from "react";

type Deployment =
  paths["/app/{appId}/deployments/{deploymentId}"]["get"]["responses"]["200"]["content"]["application/json"];

type LogType = components["schemas"]["LogLine"]["type"];

export const Logs = ({
  deployment,
  type,
}: {
  deployment: Pick<Deployment, "status" | "id" | "appId" | "updatedAt">;
  type: LogType;
}) => {
  const [logs, setLogs] = useState<components["schemas"]["LogLine"][]>([]);

  const { connected } = useEventSource(
    new URL(
      `${window.location.protocol}//${window.location.host}/api/app/${deployment.appId}/deployments/${deployment.id}/logs?type=${type}`,
    ),
    (event) => {
      const newLine = event.data as string;
      setLogs((lines) => {
        const parsed = JSON.parse(newLine) as components["schemas"]["LogLine"];
        for (const existingLine of lines) {
          if (parsed.id && existingLine.id === parsed.id) return lines;
        }
        if (lines.length >= 1000) {
          // Keep the array at a maximum of 1000 items
          return lines.toSpliced(0, lines.length - 999).concat(parsed);
        }
        return lines.concat(parsed);
      });
    },
  );

  return (
    <div className="bg-gray-100 font-mono w-full rounded-md my-4 p-4 overflow-x-scroll">
      {!connected ? (
        <p className="text-amber-600 flex items-center gap-2 text-sm mb-2">
          <AlertTriangle /> Disconnected. New logs will not appear until the
          connection is re-established.
        </p>
      ) : (
        <p className="text-blue-500 flex items-center gap-2 text-sm mb-2">
          <div className="relative w-4 h-5">
            <div className="absolute top-1/2 left-1/2 -translate-1/2 size-2 rounded-full bg-blue-500 animate-pulse" />
            <div className="absolute top-1/2 left-1/2 -translate-1/2 size-2 rounded-full bg-blue-500 animate-ping" />
          </div>
          Receiving logs in realtime
        </p>
      )}
      {logs && logs.length > 0 ? (
        <pre>
          {logs?.map((log) => (
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
              : null}
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
