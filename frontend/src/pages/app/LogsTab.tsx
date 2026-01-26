import { Logs } from "@/components/Logs";

export const LogsTab = ({ appId }: { appId: number }) => {
  return <Logs appId={appId} type="RUNTIME" deployment={undefined} />;
};
