import { Button } from "@/components/ui/button";
import { UserContext } from "@/components/UserProvider";
import { api } from "@/lib/api";
import { ExternalLink, GitBranch, Plus } from "lucide-react";
import { useContext } from "react";
import { Link } from "react-router-dom";
import { Status } from "./AppView";
import { GitHubIcon } from "./CreateAppView";

export default function DashboardView() {
  const { user } = useContext(UserContext);

  return (
    <main className="py-10 px-8">
      <div className="flex items-start">
        <h2 className="font-bold text-3xl mb-4 w-48 h-14 inline-block">
          Your Apps
        </h2>
        <div className="w-fit h-14">
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
          />
        ))}
      </div>
    </main>
  );
}

const OrgApps = ({
  orgId,
  permissionLevel,
}: {
  orgId: number;
  permissionLevel: "OWNER" | "USER";
}) => {
  const { data: org } = api.useSuspenseQuery("get", "/org/{orgId}", {
    params: {
      path: {
        orgId: orgId,
      },
    },
  });

  const apps =
    org.apps.length == 0 ? (
      <p className="opacity-50">No apps found in this organization.</p>
    ) : (
      <div className="w-full grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {org.apps.map((app) => (
          <div className="flex flex-col justify-between border border-input rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors p-4 w-full h-32 relative">
            <div>
              <p className="text-xl font-medium mb-1">
                <Link to={`/app/${app.id}`}>
                  {app.displayName}
                  {/* Make this link's tap target take up the entire card */}
                  <span className="absolute inset-0" />
                </Link>
              </p>
              {app.commitHash ? (
                <p className="text-sm text-black-4">
                  Commit <code>{app.commitHash?.slice(0, 8)} </code>
                  on{" "}
                  <a
                    href={`${app.repositoryURL}/tree/${app.branch}`}
                    target="_blank"
                  >
                    <GitBranch className="inline" size={16} />{" "}
                    <code>{app.branch}</code>
                  </a>
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
        ))}
      </div>
    );

  return (
    <div>
      <h3 className="text-xl font-medium mb-2">{org?.name}</h3>
      {org.githubInstallationId ? (
        apps
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
