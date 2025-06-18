import { Button } from "@/components/ui/button";
import { UserContext } from "@/components/UserProvider";
import { api } from "@/lib/api";
import { ExternalLink, GitBranch, Plus } from "lucide-react";
import { useContext } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Status } from "./AppView";

export default function DashboardView() {
  const { user } = useContext(UserContext);

  return (
    <main className="py-10 px-8">
      <h2 className="font-bold text-3xl mb-4">Your Apps</h2>
      <div className="flex flex-col gap-8">
        {user?.orgs?.map((org) => <OrgApps orgId={org.id} key={org.id} />)}
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

const OrgApps = ({ orgId }: { orgId: number }) => {
  const navigate = useNavigate();
  const { data: org } = api.useSuspenseQuery("get", "/org/{orgId}", {
    params: {
      path: {
        orgId: orgId,
      },
    },
  });

  org.apps = [
    {
      id: 1,
      name: "name",
      status: "PENDING",
      branch: "main",
      repositoryURL: "https://github.com/octocat/spoon-knife",
      commitHash: "06f807b4f6aa7344b5273bb009aaf09e8773f3e3",
      link: "https://app1.anvilops.rcac.purdue.edu",
    },
  ];
  return (
    <div>
      <h3 className="text-xl font-medium mb-2">{org?.name}</h3>
      {org.apps.length == 0 ? (
        <p className="opacity-50">No apps found in this organization.</p>
      ) : (
        <div className="w-full grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {org
            ? org.apps.map((app) => (
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
                        className="text-base text-black-4 space-x-1"
                      >
                        <span>View Deployment</span>
                        <ExternalLink className="size-4 inline" />
                      </a>
                    ) : null}
                  </div>
                </Button>
              ))
            : null}
        </div>
      )}
    </div>
  );
};
