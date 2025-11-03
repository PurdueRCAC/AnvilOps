import type { components, paths } from "@/generated/openapi";
import { useEventSource } from "@/hooks/useEventSource";
import clsx from "clsx";
import { AlertTriangle, FileClock, Loader, SatelliteDish } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "./ui/button";

type Deployment =
  paths["/app/{appId}/deployments/{deploymentId}"]["get"]["responses"]["200"]["content"]["application/json"];

type LogType = components["schemas"]["LogLine"]["type"];

export const Logs = ({
  deployment,
  type,
}: {
  deployment: Pick<
    Deployment,
    "status" | "id" | "appId" | "updatedAt" | "podStatus"
  >;
  type: LogType;
}) => {
  const [logs, setLogs] = useState<components["schemas"]["LogLine"][]>([]);
  const [noLogs, setNoLogs] = useState(false); // Set to true when we know there are no logs for this deployment

  const logsBody = useRef<HTMLDivElement | null>(null);
  const lastScroll = useRef({ scrollTop: 0, hasScrolledUp: false });
  const isNearBottom = (element: HTMLDivElement, threshold = 500) =>
    element.scrollHeight - element.scrollTop <= threshold;

  // useLayoutEffect scrolls the element before paint
  useLayoutEffect(() => {
    const element = logsBody.current;
    if (
      element &&
      (!lastScroll.current.hasScrolledUp || isNearBottom(element))
    ) {
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
        onScroll={() => {
          const element = logsBody.current;
          if (element) {
            const lastScrollTop = lastScroll.current.scrollTop;

            lastScroll.current.hasScrolledUp =
              element.scrollTop < lastScrollTop;
            lastScroll.current.scrollTop = element.scrollTop;
          }
        }}
        className="bg-gray-100 font-mono w-full rounded-md my-4 py-4 overflow-x-auto max-h-[70vh]"
      >
        {logs && logs.length > 0 ? (
          <table className="w-full">
            <tbody>
              {logs?.map((log) => (
                <tr
                  key={log.id}
                  className={clsx(
                    "font-mono whitespace-pre-wrap [&>*]:align-top",
                    log.stream === "stderr" &&
                      "text-red-900 bg-red-100 first:rounded-t-md last:rounded-b-md",
                  )}
                >
                  <td className="opacity-50 whitespace-nowrap w-0 pl-4 pr-2">
                    {/* "w-0" above forces this column to take up as little horizontal space as possible */}
                    {new Date(log.time).toLocaleString()}
                  </td>
                  {(deployment.podStatus?.total ?? 1) > 1 && (
                    <td className="px-2">
                      <span className="opacity-70">{log.pod}</span>
                    </td>
                  )}
                  <td className="pl-2 pr-4">
                    <p>{log.log}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : type === "BUILD" && !noLogs ? (
          <div className="px-4">
            <p className="flex gap-2 text-lg font-medium">
              <SatelliteDish /> Logs Unavailable
            </p>
            <p className="opacity-50 ml-8">
              {["PENDING", "BUILDING"].includes(deployment.status)
                ? "Waiting for the build to start."
                : null}
            </p>
          </div>
        ) : !connecting ? (
          <div className="px-4">
            <p className="flex gap-2 text-lg font-medium">
              <FileClock /> No Logs Found
            </p>
            <p className="opacity-50 ml-8">
              {["PENDING", "BUILDING", "DEPLOYING"].includes(deployment.status)
                ? "Waiting for your app to be deployed."
                : ["COMPLETE", "STOPPED"].includes(deployment.status) &&
                    type === "BUILD"
                  ? "Build completed with no log output."
                  : "Logs from your app will appear here."}
            </p>
          </div>
        ) : null}
      </div>
      <Button
        onClick={() => {
          const data = logs.map((log) => `${log.time} ${log.log}\n`);
          const blob = new Blob(data, { type: "text/plain" });

          const downloadLink = document.createElement("a");
          const url = URL.createObjectURL(blob);
          downloadLink.href = url;
          downloadLink.download = "logs.txt";
          downloadLink.click();

          URL.revokeObjectURL(url);
        }}
      >
        Download logs
      </Button>
    </>
  );
};
