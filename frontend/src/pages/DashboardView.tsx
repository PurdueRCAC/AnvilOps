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
    <main className="px-8 py-10">
      <div className="flex items-start">
        <h2 className="mb-4 inline-block h-14 w-48 text-3xl font-bold">
          Your Apps
        </h2>
        <div className="flex h-14 w-fit space-x-2">
          <Link to="/create-group">
            <Button className="shadow-black-3 hover:text-gold-1 flex h-10 w-fit items-center hover:bg-black hover:shadow-sm">
              <p className="text-base">Create an App Group</p>
              <Plus className="size-5" strokeWidth="1" />
            </Button>
          </Link>
          <Link to="/create-app">
            <Button className="shadow-black-3 hover:text-gold-1 flex h-10 w-fit items-center hover:bg-black hover:shadow-sm">
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
        <section className="grid w-full grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
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
      <h3 className="border-b-gold mb-4 border-b-2 text-xl font-medium">
        {name}
      </h3>
      {isPending ? (
        <p className="flex items-center space-x-1 text-lg">
          <Loader className="inline animate-spin" />
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
        <div className="mb-2 flex items-center gap-2 text-lg">
          <h3>{appGroup.name}</h3>
        </div>
      )}
      <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
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
      className={`border-input relative flex h-32 w-full flex-col justify-between rounded-lg border bg-gray-50 p-4 transition-colors hover:bg-gray-100`}
    >
      <div>
        <p className="mb-1 text-xl font-medium">
          <Link to={`/app/${app.id}`}>
            {app.displayName}
            {/* Make this link's tap target take up the entire card */}
            <span className="absolute inset-0" />
          </Link>
        </p>
        {app.source === "GIT" ? (
          <p className="text-black-4 z-10 text-sm">
            Commit <code>{app.commitHash?.slice(0, 8)}</code> on{" "}
            <a
              href={`${app.repositoryURL}/tree/${app.branch}`}
              target="_blank"
              rel="noreferrer"
            >
              <GitBranch className="inline" size={16} />{" "}
              <code>{app.branch}</code>
            </a>
          </p>
        ) : app.source === "IMAGE" ? (
          <p className="text-black-4 truncate text-sm text-ellipsis">
            <Container className="inline" size={16} /> {app.imageTag}
          </p>
        ) : null}
      </div>
      <div className="flex items-center justify-between">
        <Status status={app.status} className="text-black-4 text-base" />
        {app.link ? (
          <a
            href={app.link}
            target="_blank"
            className="text-black-4 z-10 space-x-1 text-base hover:underline"
            rel="noreferrer"
          >
            <span>View Deployment</span>
            <ExternalLink className="inline size-4" />
          </a>
        ) : null}
      </div>
    </div>
  );
};
