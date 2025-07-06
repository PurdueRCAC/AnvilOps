import { Button } from "@/components/ui/button";
import { UserContext } from "@/components/UserProvider";
import { api } from "@/lib/api";
import {
  Container,
  EllipsisVertical,
  ExternalLink,
  GitBranch,
  Plus,
} from "lucide-react";
import { useContext, useState } from "react";
import { Link } from "react-router-dom";
import { Status } from "./app/AppView";
import { GitHubIcon } from "./CreateAppView";
import type { components } from "@/generated/openapi";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export default function DashboardView() {
  const { user } = useContext(UserContext);
  const { mutateAsync: deleteAppGroupAction } = api.useMutation(
    "delete",
    "/app/group/{appGroupId}",
  );

  const deleteAppGroup = async (appGroupId: number) => {
    try {
      await deleteAppGroupAction({
        params: { path: { appGroupId } },
      });
    } catch (e) {
      toast.error("There was a problem deleting your project.");
      return;
    }
    toast.success("Your project has been deleted.");
  };
  return (
    <main className="py-10 px-8">
      <div className="flex items-start">
        <h2 className="font-bold text-3xl mb-4 w-48 h-14 inline-block">
          Your Apps
        </h2>
        <div className="w-fit h-14 flex space-x-2">
          <Link to="/create-group">
            <Button className="w-fit h-10 flex items-center hover:bg-black hover:text-gold-1 shadow-black-3 hover:shadow-sm">
              <p className="text-base">Create an App Group</p>
              <Plus className="size-5" strokeWidth="1" />
            </Button>
          </Link>
          <Link to="/create-app">
            <Button className="w-fit h-10 flex items-center hover:bg-black hover:text-gold-1 shadow-black-3 hover:shadow-sm">
              <p className="text-base">Create an App</p>
              <Plus className="size-5" strokeWidth="1" />
            </Button>
          </Link>
        </div>
      </div>
      <div className="flex flex-col gap-8">
        {user?.orgs?.map((org) => (
          <OrgApps
            orgId={org.id}
            key={org.id}
            permissionLevel={org.permissionLevel}
            deleteAppGroup={deleteAppGroup}
          />
        ))}
      </div>
    </main>
  );
}

const OrgApps = ({
  orgId,
  permissionLevel,
  deleteAppGroup,
}: {
  orgId: number;
  permissionLevel: "OWNER" | "USER";
  deleteAppGroup: (appGroupId: number) => Promise<void>;
}) => {
  const { data: org, refetch } = api.useSuspenseQuery("get", "/org/{orgId}", {
    params: {
      path: {
        orgId: orgId,
      },
    },
  });

  const appGroups =
    org.appGroups.length == 0 ? (
      <p className="opacity-50">No apps found in this organization.</p>
    ) : (
      <div className="w-full grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {org.appGroups.map((group) => (
          <AppGroup
            appGroup={group}
            deleteAppGroup={async () => {
              await deleteAppGroup(group.id);
              refetch();
            }}
          />
        ))}
      </div>
    );

  return (
    <div>
      <h3 className="text-xl font-medium mb-4 border-b-gold border-b-2">
        {org?.name}
      </h3>
      {org.githubInstallationId ? (
        appGroups
      ) : permissionLevel === "OWNER" ? (
        <div className="w-fit">
          <p className="mt-4">
            <strong>{org.name}</strong> has not been connected to GitHub.
          </p>
          <p className="mb-4">
            AnvilOps integrates with GitHub to deploy your app as soon as you
            push to your repository.
          </p>
          <a
            className="flex w-full"
            href={`/api/org/${org.id}/install-github-app`}
          >
            <Button className="w-full" type="button">
              <GitHubIcon />
              Install GitHub App
            </Button>
          </a>
        </div>
      ) : (
        <>
          <p className="my-4">
            <strong>{org.name}</strong> has not been connected to GitHub. Ask
            the owner of your organization to install the AnvilOps GitHub App.
          </p>
        </>
      )}
    </div>
  );
};

const AppGroup = ({
  appGroup,
  deleteAppGroup,
}: {
  appGroup: components["schemas"]["Org"]["appGroups"][0];
  deleteAppGroup: (appGroupId: number) => Promise<void>;
}) => {
  const [nameText, setNameText] = useState("");
  return (
    <>
      <div
        key={appGroup.id}
        className={
          !appGroup.isMono
            ? "rounded-md col-span-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 p-2 pl-4 pr-4 pb-6 border border-stone-300 shadow-stone-300 shadow-sm"
            : ""
        }
      >
        {!appGroup.isMono && (
          <div className="col-span-4 text-lg flex items-center space-x-1">
            <h3>{appGroup.name}</h3>
            <DropdownMenu onOpenChange={() => setNameText("")}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="rounded-full">
                  <EllipsisVertical />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent sideOffset={0} className="relative left-1/2">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                      Delete App Group
                    </DropdownMenuItem>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Confirm delete group</AlertDialogTitle>
                      <AlertDialogDescription>
                        <p>
                          This action cannot be undone.
                          <ul className="*:list-disc *:ml-4 mt-2 mb-4">
                            <li>
                              All AnvilOps apps in this group, as well as
                              associated deployments and infrastructure, will be
                              deleted.
                            </li>
                            <li>
                              All subdomains used by apps in this group will
                              become available for other projects to use.
                            </li>
                            <li>Your Git repositories will be unaffected.</li>
                          </ul>
                        </p>
                        <p className="mb-2">
                          Type the group name <b>{appGroup.name}</b> to
                          continue.
                        </p>
                        <Input
                          placeholder={appGroup.name}
                          value={nameText}
                          onChange={(e) => setNameText(e.currentTarget.value)}
                        />
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        variant="destructive"
                        disabled={nameText !== appGroup.name}
                        onClick={async () => deleteAppGroup(appGroup.id)}
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {appGroup.apps.map((app) => (
          <AppCard app={app} appGroup={appGroup} />
        ))}
      </div>
    </>
  );
};

const AppCard = ({
  app,
  appGroup,
}: {
  app: components["schemas"]["AppSummary"];
  appGroup: components["schemas"]["Org"]["appGroups"][0];
}) => {
  return (
    <div
      key={app.id}
      className={cn(
        "flex flex-col justify-between border border-input rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors p-4 w-full h-32 relative",
        !appGroup.isMono
          ? "shadow-sm shadow-stone-500"
          : "shadow-sm shadow-stone-400",
      )}
    >
      <div>
        <p className="text-xl font-medium mb-1">
          <Link to={`/app/${app.id}`}>
            {app.displayName}
            {/* Make this link's tap target take up the entire card */}
            <span className="absolute inset-0" />
          </Link>
        </p>
        {app.source === "GIT" ? (
          <p className="text-sm text-black-4">
            Commit <code>{app.commitHash?.slice(0, 8)}</code> on{" "}
            <a href={`${app.repositoryURL}/tree/${app.branch}`} target="_blank">
              <GitBranch className="inline" size={16} />{" "}
              <code>{app.branch}</code>
            </a>
          </p>
        ) : app.source === "IMAGE" ? (
          <p className="text-sm text-black-4">
            <Container className="inline" size={16} /> {app.imageTag}
          </p>
        ) : null}
      </div>
      <div className="flex justify-between items-center">
        <Status status={app.status} className="text-base text-black-4" />
        {app.link ? (
          <a
            href={app.link}
            target="_blank"
            className="text-base text-black-4 space-x-1 hover:underline z-10"
          >
            <span>View Deployment</span>
            <ExternalLink className="size-4 inline" />
          </a>
        ) : null}
      </div>
    </div>
  );
};
