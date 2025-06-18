import { Button } from "@/components/ui/button";
import { UserContext } from "@/components/UserProvider";
import { api } from "@/lib/api";
import { ExternalLink, GitBranch, Plus } from "lucide-react";
import { useContext } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Status } from "./AppView";
import { GitHubIcon } from "./CreateAppView";

export default function DashboardView() {
  const { user } = useContext(UserContext);

  return (
    <main className="py-10 px-8">
      <h2 className="font-bold text-3xl mb-4">Your Apps</h2>
      <div className="flex flex-col gap-8">
        {user?.orgs?.map((org) => (
          <OrgApps
            orgId={org.id}
            key={org.id}
            permissionLevel={org.permissionLevel}
          />
        ))}
        <div>
          <h3 className="text-xl font-medium mb-2">Create App</h3>
          <div className="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Link to="/create-app" className="h-42 xl:h-52 w-full">
              <Button
                variant="secondary"
                className="w-full h-full hover:ring-2 hover:ring-gray-400 hover:bg-gold-3"
              >
                <Plus className="size-20" strokeWidth="1" />
              </Button>
            </Link>
          </div>
        </div>
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
  const navigate = useNavigate();
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
          <Button
            variant="secondary"
            className="w-full h-28 hover:ring-2 hover:ring-gray-400 hover:bg-gold-1 text-xl text-left relative"
            onClick={(_) => navigate(`/app/${app.id}`)}
          >
            <div className="h-3/4 w-full">
              <div>
                <p>{app.name}</p>
                {app.commitHash ? (
                  <p className="text-sm">
                    Commit <code>{app.commitHash?.slice(0, 8)} </code>
                    on{" "}
                    <a
                      href={`${app.repositoryURL}/tree/${app.branch}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <GitBranch className="inline" size={16} />{" "}
                      <code>{app.branch}</code>
                    </a>
                  </p>
                ) : null}
                <Status
                  status={app.status}
                  className="text-base text-black-4"
                />
              </div>
            </div>
            <div className="text-right absolute right-4 bottom-4 lg:bottom-5 lg:right-6">
              {app.link ? (
                <a
                  href={app.link}
                  onClick={(e) => e.stopPropagation()}
                  className="text-base text-black-4 space-x-1 hover:underline"
                >
                  <span>View Deployment</span>
                  <ExternalLink className="size-4 inline" />
                </a>
              ) : null}
            </div>
          </Button>
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
