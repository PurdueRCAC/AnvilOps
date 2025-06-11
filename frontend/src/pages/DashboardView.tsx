import { Button } from "@/components/ui/button";
import { UserContext } from "@/components/UserProvider";
import { api } from "@/lib/api";
import { useContext } from "react";
import { Link } from "react-router-dom";

export default function DashboardView() {
  const { user } = useContext(UserContext);

  const { data: org } = api.useQuery(
    "get",
    "/org/{orgId}",
    {
      params: {
        path: {
          orgId: user?.org?.id!,
        },
      },
    },
    { enabled: user !== undefined },
  );

  return (
    <main className="py-10 px-8">
      <h2 className="font-bold text-3xl mb-4">Your Apps</h2>
      <div className="w-full h-screen grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {org
          ? org.apps.map((app) => (
              <Link to={`/app/${app.id}`} className="block max-h-max">
                <Button
                  variant="secondary"
                  className="h-42 xl:h-52 w-full cursor-pointer hover:ring-2 hover:ring-gray-400 text-xl"
                >
                  {app.name}
                </Button>
              </Link>
            ))
          : null}
        <Link to="/create-app">
          <Button
            variant="secondary"
            className="h-42 xl:h-52 w-full cursor-pointer hover:ring-2 hover:ring-gray-400"
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
    </main>
  );
}
