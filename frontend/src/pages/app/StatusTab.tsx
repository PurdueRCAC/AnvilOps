import { api } from "@/lib/api";
import { Container } from "lucide-react";
import type { App } from "./AppView";

export const StatusTab = ({ app }: { app: App }) => {
  const { data: pods } = api.useQuery("get", "/app/{appId}/pods", {
    params: { path: { appId: app.id } },
  });

  return (
    <>
      <h3 className="text-xl font-medium mb-4">Pods</h3>
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
        <pre>
          <code>{JSON.stringify(pods, null, 2)}</code>
        </pre>
      )}
    </>
  );
};
