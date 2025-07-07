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
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import type { App } from "./AppView";

export const DangerZoneTab = ({ app }: { app: App }) => {
  const { mutateAsync: deleteProject } = api.useMutation(
    "delete",
    "/app/{appId}",
  );

  const navigate = useNavigate();
  const params = useParams();

  const appId = parseInt(params.id!);

  const [text, setText] = useState("");

  return (
    <>
      <h2 className="text-xl font-medium mb-2">Delete Project</h2>
      <p className="opacity-50 mb-4">
        Permanently delete all deployments, logs, and compute resources
        associated with this project without affecting the source Git
        repository.
      </p>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive">Delete Project</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm delete project</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <ul className="*:list-disc *:ml-4 mt-2 mb-4">
                  This action cannot be undone.
                  <li>
                    Your AnvilOps project and all associated deployments and
                    infrastructure will be deleted.
                  </li>
                  <li>
                    Your project's subdomain will become available for other
                    projects to use.
                  </li>
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
              variant="destructive"
              disabled={text !== app.displayName}
              onClick={async () => {
                try {
                  await deleteProject({
                    params: { path: { appId: appId } },
                  });
                } catch (e) {
                  toast.error("There was a problem deleting your project.");
                  return;
                }
                toast.success("Your project has been deleted.");
                navigate("/dashboard");
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
