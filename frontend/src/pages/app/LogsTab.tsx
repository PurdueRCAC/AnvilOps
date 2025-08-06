import type { DeploymentInfo } from "@/components/DeploymentStatus";
import { Logs } from "@/components/Logs";
import { Loader } from "lucide-react";

export const LogsTab = ({ deployment }: { deployment?: DeploymentInfo }) => {
  if (!deployment) {
    return <Loader className="animate-spin" />;
  }

  return <Logs key={deployment.id} deployment={deployment} type="RUNTIME" />;
};
