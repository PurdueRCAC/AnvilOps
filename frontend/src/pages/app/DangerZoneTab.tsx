import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type { App } from "./AppView";

export const DangerZoneTab = ({ app }: { app: App }) => {
  return (
    <>
      <h2 className="mb-2 text-xl font-medium">Migrate Project</h2>
      <p className="mb-4 opacity-50">
        AnvilOps will stop managing this application, but Kubernetes resources
        will not be deleted.
      </p>
      <DeleteDialog app={app} keepNamespace={true} />
      <h2 className="mt-4 mb-2 text-xl font-medium">Delete Project</h2>
      <p className="mb-4 opacity-50">
        Permanently delete all deployments, logs, and compute resources
        associated with this project without affecting the source Git
        repository.
      </p>
      <DeleteDialog app={app} keepNamespace={false} />
    </>
  );
};

const DeleteDialog = ({
  app,
  keepNamespace,
}: {
  app: App;
  keepNamespace: boolean;
}) => {
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const { mutateAsync: deleteProject } = api.useMutation(
    "post",
    "/app/{appId}/delete",
  );
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant={keepNamespace ? "outline" : "destructive"}>
          {keepNamespace ? "Migrate" : "Delete"} Project
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Confirm {keepNamespace ? "migrate" : "delete"} project
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>
              <ul className="mt-2 mb-4 *:ml-4 *:list-disc">
                {keepNamespace ? (
                  <>
                    <li>AnvilOps will stop managing this application.</li>
                    <li>
                      AnvilOps will delete logs stored for this application.
                    </li>
                    <li>
                      Infrastructure associated with this application will still
                      be available in the Kubernetes namespace{" "}
                      <b>{app.namespace}</b>.
                    </li>
                  </>
                ) : (
                  <>
                    This action cannot be undone.
                    <li className="font-bold">
                      Your AnvilOps project and all associated deployments and
                      infrastructure will be deleted.
                    </li>
                    <li>
                      Your project's subdomain will become available for other
                      projects to use.
                    </li>
                  </>
                )}
                <li>Your Git repository will be unaffected.</li>
              </ul>
              <p className="mb-2">
                Type the project name <b>{app.displayName}</b> to continue.
              </p>
              <Input
                placeholder={app.displayName}
                value={text}
                onChange={(e) => setText(e.currentTarget.value)}
              />
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant={keepNamespace ? "default" : "destructive"}
            disabled={text !== app.displayName}
            onClick={async () => {
              try {
                await deleteProject({
                  params: { path: { appId: app.id } },
                  body: { keepNamespace },
                });
              } catch (e) {
                toast.error("There was a problem deleting your project.");
                return;
              }
              toast.success("Your project has been deleted.");
              navigate("/dashboard");
            }}
          >
            {keepNamespace ? "Migrate" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
