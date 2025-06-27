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
  if (app?.activeDeployment === undefined) {
    return (
      <p className="opacity-50 flex items-center gap-2">
        <CircleDashed /> Waiting to deploy...
      </p>
    );
  }

  if (deployment === undefined) {
    // We know the active deployment but it hasn't loaded yet
    return (
      <p className="opacity-50 flex items-center gap-2">
        <Loader className="animate-spin" /> Loading...
      </p>
    );
  }

  // Any of the pods has failed (highest priority)
  if (deployment.podStatus?.failed && deployment.podStatus?.failed > 0) {
    return (
      <Tooltip>
        <TooltipTrigger>
          <p className="text-red-500 flex items-center gap-2">
            <CloudLightning />
            {deployment.podStatus?.failed} Failed
          </p>
        </TooltipTrigger>
        <TooltipContent>
          {deployment.podStatus?.failed} of your app's pods have crashed. Check
          the Status and Logs tabs for more info.
        </TooltipContent>
      </Tooltip>
    );
  }

  // Not all of the pods have been created yet
  if (
    deployment.podStatus?.scheduled &&
    deployment.podStatus.scheduled < deployment.podStatus.total
  ) {
    const pending = deployment.podStatus.total - deployment.podStatus.scheduled; // # of pods that have not been scheduled
    return (
      <Tooltip>
        <TooltipTrigger>
          <p className="text-yellow-600 flex items-center gap-2">
            <CloudCog />
            {pending} Pending
          </p>
        </TooltipTrigger>
        <TooltipContent>
          Your app has built. {pending} pods are waiting to deploy.
        </TooltipContent>
      </Tooltip>
    );
  }

  // All of the pods have been scheduled, but some them aren't ready
  if (
    deployment.podStatus &&
    deployment.podStatus.ready < deployment.podStatus.total
  ) {
    const scheduled = deployment.podStatus.total - deployment.podStatus.ready; // # of pods that are not ready yet
    return (
      <Tooltip>
        <TooltipTrigger>
          <p className="text-amber-600 flex items-center gap-2">
            <CloudUpload />
            {scheduled} Scheduled
          </p>
        </TooltipTrigger>
        <TooltipContent>
          Your app has built. {scheduled} pods are currently deploying.
        </TooltipContent>
      </Tooltip>
    );
  }

  // All of the pods are ready
  return (
    <Tooltip>
      <TooltipTrigger>
        <p className="text-green-500 flex items-center gap-2">
          <CloudCheck />
          {deployment.podStatus?.ready} Ready
        </p>
      </TooltipTrigger>
      <TooltipContent>
        Your app has started and is ready to receive requests.
      </TooltipContent>
    </Tooltip>
  );
};
