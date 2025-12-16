import { Button } from "@/components/ui/button";
import { UserContext } from "@/components/UserProvider";
import type { components } from "@/generated/openapi";
import { api } from "@/lib/api";
import { Container, ExternalLink, GitBranch, Loader, Plus } from "lucide-react";
import { Fragment, useContext } from "react";
import { Link } from "react-router-dom";
import { Status } from "./app/AppView";

export default function DashboardView() {
  const { user } = useContext(UserContext);

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
          <OrgApps orgId={org.id} name={org.name} key={org.id} />
        ))}
      </div>
    </main>
  );
}

const OrgApps = ({ orgId, name }: { orgId: number; name: string }) => {
  const { data: org, isPending } = api.useQuery("get", "/org/{orgId}", {
    params: {
      path: {
        orgId: orgId,
      },
    },
  });

  const monoGroups = org?.appGroups.filter((group) => group.isMono);
  const multiGroups = org?.appGroups.filter((group) => !group.isMono);

  const appGroups =
    org?.appGroups.length == 0 ? (
      <p className="opacity-50">No apps found in this organization.</p>
    ) : (
      <>
        {multiGroups?.map((group) => (
          <AppGroup appGroup={group} key={group.id} />
        ))}

        {monoGroups &&
          monoGroups.length > 0 &&
          monoGroups?.some((it) => it.apps.length > 0) && (
            <h3 className="my-4">Ungrouped</h3>
          )}
        <section className="w-full grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {monoGroups?.map((group) => (
            <Fragment key={group.id}>
              {group.apps.map((app) => (
                <AppCard key={app.id} app={app} />
              ))}
            </Fragment>
          ))}
        </section>
      </>
    );

  return (
    <div>
      <h3 className="text-xl font-medium mb-4 border-b-gold border-b-2">
        {name}
      </h3>
      {isPending ? (
        <p className="text-lg flex items-center space-x-1">
          <Loader className="animate-spin inline" />
          <span>Loading apps...</span>
        </p>
      ) : (
        appGroups
      )}
    </div>
  );
};

type AppGroupType = components["schemas"]["Org"]["appGroups"][0];

const AppGroup = ({ appGroup }: { appGroup: AppGroupType }) => {
  return (
    <section className="mb-8">
      {!appGroup.isMono && (
        <div className="mb-2 text-lg flex items-center gap-2">
          <h3>{appGroup.name}</h3>
        </div>
      )}
      <div className="w-full grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {appGroup.apps.map((app) => (
          <AppCard app={app} key={app.id} />
        ))}
      </div>
    </section>
  );
};

const AppCard = ({ app }: { app: components["schemas"]["AppSummary"] }) => {
  return (
    <div
      className={
        "flex flex-col justify-between border border-input rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors p-4 w-full h-32 relative"
      }
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
          <p className="text-sm text-black-4 z-10">
            Commit <code>{app.commitHash?.slice(0, 8)}</code> on{" "}
            <a href={`${app.repositoryURL}/tree/${app.branch}`} target="_blank">
              <GitBranch className="inline" size={16} />{" "}
              <code>{app.branch}</code>
            </a>
          </p>
        ) : app.source === "IMAGE" ? (
          <p className="text-sm text-black-4 overflow-ellipsis overflow-hidden whitespace-nowrap">
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
