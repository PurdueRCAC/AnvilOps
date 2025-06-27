import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { paths } from "@/generated/openapi";
import type { App } from "@/pages/app/AppView";
import {
  CircleDashed,
  CloudCheck,
  CloudCog,
  CloudLightning,
  CloudUpload,
  Loader,
} from "lucide-react";

export type DeploymentInfo =
  paths["/app/{appId}/deployments/{deploymentId}"]["get"]["responses"]["200"]["content"]["application/json"];

export const DeploymentStatus = ({
  app,
  deployment,
}: {
  app?: App;
  deployment?: DeploymentInfo;
}) => {
  return (
    <Tooltip>
      {app?.activeDeployment === undefined ? (
        <p className="opacity-50 flex items-center gap-2">
          <CircleDashed /> Waiting to deploy...
        </p>
      ) : !deployment ? (
        <p className="opacity-50 flex items-center gap-2">
          <Loader className="animate-spin" /> Loading...
        </p>
      ) : (
        <>
          {deployment.podStatus?.phase === "Failed" ||
          deployment.podStatus?.state === "terminated" ? (
            <>
              <TooltipTrigger>
                <p className="text-red-500 flex items-center gap-2">
                  <CloudLightning />
                  Failed
                </p>
              </TooltipTrigger>
              <TooltipContent>
                Your app has crashed. Check the logs for more info.
              </TooltipContent>
            </>
          ) : deployment.podStatus?.ready ? (
            <>
              <TooltipTrigger>
                <p className="text-green-500 flex items-center gap-2">
                  <CloudCheck /> Ready
                </p>
              </TooltipTrigger>
              <TooltipContent>
                Your app has started and is ready to receive requests.
              </TooltipContent>
            </>
          ) : deployment.podStatus?.scheduled ? (
            <>
              <TooltipTrigger>
                <p className="text-amber-600 flex items-center gap-2">
                  <CloudUpload />
                  Scheduled
                </p>
              </TooltipTrigger>
              <TooltipContent>
                Your app has built and is currently deploying.
              </TooltipContent>
            </>
          ) : (
            <>
              <TooltipTrigger>
                <p className="text-yellow-600 flex items-center gap-2">
                  <CloudCog />
                  Pending
                </p>
              </TooltipTrigger>
              <TooltipContent>
                Your app has built and is waiting to deploy.
              </TooltipContent>
            </>
          )}
        </>
      )}
    </Tooltip>
  );
};
