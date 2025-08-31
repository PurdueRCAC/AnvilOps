import type { components, paths } from "@/generated/openapi";
import { useEventSource } from "@/hooks/useEventSource";
import { AlertTriangle, FileClock, Loader, SatelliteDish } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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
  const [noLogs, setNoLogs] = useState(false); // Set to true when we know there are no logs for this deployment

  const logsBody = useRef<HTMLDivElement | null>(null);
  const [hasScrolled, setHasScrolled] = useState(false);
  const isNearBottom = (element: HTMLDivElement, threshold = 500) =>
    element.scrollHeight - element.scrollTop <= threshold;
  useEffect(() => {
    const element = logsBody.current;
    if (element && (!hasScrolled || isNearBottom(element))) {
      element.scrollTop = element.scrollHeight;
    }
  }, [logs]);

  const { connecting, connected } = useEventSource(
    new URL(
      `${window.location.protocol}//${window.location.host}/api/app/${deployment.appId}/deployments/${deployment.id}/logs?type=${type}`,
    ),
    ["log", "pastLogsSent"],
    (eventName, event) => {
      if (eventName === "pastLogsSent") {
        if (logs.length === 0) {
          setNoLogs(true);
        }
        return;
      }
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
      if (noLogs) {
        setNoLogs(false);
      }
    },
  );

  return (
    <>
      {connecting ? (
        <p className="flex items-center gap-2 text-sm font-mono">
          <Loader className="animate-spin" /> Connecting...
        </p>
      ) : !connected ? (
        <p className="text-amber-600 flex items-center gap-2 text-sm mb-2 font-mono">
          <AlertTriangle /> Disconnected. New logs will not appear until the
          connection is re-established.
        </p>
      ) : (
        <p className="text-blue-500 flex items-center gap-2 text-sm mb-2 font-mono">
          <div className="relative w-4 h-5">
            <div className="absolute top-1/2 left-1/2 -translate-1/2 size-2 rounded-full bg-blue-500 animate-pulse" />
            <div className="absolute top-1/2 left-1/2 -translate-1/2 size-2 rounded-full bg-blue-500 animate-ping" />
          </div>
          Receiving logs in realtime
        </p>
      )}

      <div
        ref={logsBody}
        onScroll={() => setHasScrolled(true)}
        className="bg-gray-100 font-mono w-full rounded-md my-4 p-4 overflow-x-auto max-h-96"
      >
        {logs && logs.length > 0 ? (
          <pre>
            {logs?.map((log) => (
              <p key={log.id}>
                <span className="opacity-50">{log.time}</span> {log.log}
              </p>
            ))}
          </pre>
        ) : type === "BUILD" && !noLogs ? (
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
        ) : !connecting ? (
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
        ) : null}
      </div>
    </>
  );
};
