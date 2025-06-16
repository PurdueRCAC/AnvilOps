import { Button } from "@/components/ui/button";
import { UserContext } from "@/components/UserProvider";
import { api } from "@/lib/api";
import { useContext } from "react";
import { Link } from "react-router-dom";

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
                className="w-full h-full hover:ring-2 hover:ring-gray-400"
              >
                <svg
                  viewBox="0 0 15 15"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-1/3 h-1/3 size-auto"
                >
                  <path
                    d="M8 2.75C8 2.47386 7.77614 2.25 7.5 2.25C7.22386 2.25 7 2.47386 7 2.75V7H2.75C2.47386 7 2.25 7.22386 2.25 7.5C2.25 7.77614 2.47386 8 2.75 8H7V12.25C7 12.5261 7.22386 12.75 7.5 12.75C7.77614 12.75 8 12.5261 8 12.25V8H12.25C12.5261 8 12.75 7.77614 12.75 7.5C12.75 7.22386 12.5261 7 12.25 7H8V2.75Z"
                    fill="currentColor"
                    fillRule="evenodd"
                    clipRule="evenodd"
                  ></path>
                </svg>
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

const OrgApps = ({ orgId }: { orgId: number }) => {
  const { data: org } = api.useSuspenseQuery("get", "/org/{orgId}", {
    params: {
      path: {
        orgId: orgId,
      },
    },
  });

  return (
    <div>
      <h3 className="text-xl font-medium mb-2">{org?.name}</h3>
      {org.apps.length == 0 ? (
        <p className="opacity-50">No apps found in this organization.</p>
      ) : (
        <div className="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {org
            ? org.apps.map((app) => (
                <Link to={`/app/${app.id}`} className="h-42 xl:h-52 w-full">
                  <Button
                    variant="secondary"
                    className="w-full h-full hover:ring-2 hover:ring-gray-400 text-xl"
                  >
                    {app.name}
                  </Button>
                </Link>
              ))
            : null}
        </div>
      )}
    </div>
  );
};
