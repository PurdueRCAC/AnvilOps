import { Button } from "@/components/ui/button";
import { UserContext } from "@/components/UserProvider";
import { useContext } from "react";

export default function OrgView() {
  const { user } = useContext(UserContext);
  return (
    <main className="py-2 px-2 lg:py-10 lg:px-12">
      <h2 className="font-bold text-3xl mb-4">Your Organizations</h2>
      <div className="w-full">
        {user?.orgs.length === 0 ? (
          <p className="opacity-50">
            You are not part of any organizations. Contact your administrator to
            be added.
          </p>
        ) : (
          user?.orgs?.map((org) => {
            return (
              <div className="w-full border border-black">
                <h3 className="text-xl font-medium mb-2">{org.name}</h3>
                <hr className="solid border-t-2"></hr>
                <div className="flex flex-wrap lg:justify-between space-y-10 w-full">
                  <Card title="Members">
                    <>{/* TODO */}</>
                  </Card>

                  {org.permissionLevel === "OWNER" ? (
                    <Card title="Usage">
                      <>{/* TODO */}</>
                    </Card>
                  ) : null}
                  <Card title="Apps">
                    <>{/* TODO */}</>
                  </Card>
                  <Card title="Danger">
                    <>{/* TODO */}</>
                  </Card>
                </div>
              </div>
            );
          })
        )}
      </div>
    </main>
  );
}

const Card = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => {
  return (
    <div className="w-full md:min-w-80 md:max-w-1/5 h-60 md:h-90 flex-grow">
      <h4 className="text-md lg:text-lg pl-2">{title}</h4>
      <div className="w-full h-full bg-slate-100 pl-3 pt-3">{children}</div>
    </div>
  );
};
