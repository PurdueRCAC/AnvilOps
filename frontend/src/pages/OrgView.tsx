import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserContext } from "@/components/UserProvider";
import { api } from "@/lib/api";
import { X } from "lucide-react";
import { Suspense, useContext, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Status, type DeploymentStatus } from "./AppView";

export default function OrgView() {
  const { user, refetch } = useContext(UserContext);
  const { mutateAsync: createOrg } = api.useMutation("post", "/org");

  const submitOrg = async (orgName: string) => {
    await createOrg({
      body: {
        name: orgName,
      },
    });
    toast.success("Organization created");
    await refetch!({});
  };

  const { mutateAsync: deleteOrg } = api.useMutation("delete", "/org/{orgId}");
  const createDeleteOrg = (orgId: number) => {
    return async (_: string) => {
      try {
        await deleteOrg({
          params: { path: { orgId } },
        });
      } catch (e) {
        toast.error("There was a problem deleting your organization.");
        return;
      }
      toast.success("Your organization has been deleted.");
      await refetch!({});
    };
  };

  return (
    <main className="py-2 px-2 lg:py-10 lg:px-12">
      <h2 className="font-bold text-3xl mb-4">Your Organizations</h2>
      <div className="w-full">
        <InputConfirmDialog
          name="Create Organization"
          title="Create an Organization"
          submitName="Submit"
          description={
            <div className="flex items-baseline gap-2">
              <Label className="pb-1 mb-2">Organization Name</Label>
              <span
                className="text-red-500 cursor-default"
                title="This field is required."
              >
                *
              </span>
            </div>
          }
          submit={submitOrg}
        />

        {user?.orgs.length === 0 ? (
          <p className="opacity-50">You are not part of any organizations.</p>
        ) : (
          <>
            {user?.orgs?.map((org) => (
              <OrgSection
                name={org.name}
                orgId={org.id}
                permissionLevel={org.permissionLevel}
                deleteOrg={createDeleteOrg}
              />
            ))}
          </>
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
      <div className="w-full h-full bg-slate-50 rounded-md shadow-slate-300 shadow-sm">
        {children}
      </div>
    </div>
  );
};

const OrgSection = ({
  name,
  orgId,
  permissionLevel,
  deleteOrg,
}: {
  name: string;
  orgId: number;
  permissionLevel: "OWNER" | "USER";
  deleteOrg: (id: number) => (_: string) => Promise<void>;
}) => {
  const { data } = api.useSuspenseQuery("get", "/org/{orgId}", {
    params: { path: { orgId } },
  });

  const submitDelete = deleteOrg(orgId);

  return (
    <div key={orgId} className="mt-2">
      <h3 className="text-xl font-medium mb-2">{name}</h3>
      <hr className="solid border-t-2"></hr>
      <div className="flex flex-wrap lg:justify-start space-x-10 space-y-10 w-full">
        <Card title="Members">
          <Suspense fallback={<p>Loading...</p>}>
            <div className="">
              {data.members.map((m) => (
                <div
                  key={`org-${orgId}-${m.id}}`}
                  className="flex justify-between items-center p-2 pl-5 pr-3 h-14 border-b border-slate-300 first:rounded-t-md hover:bg-slate-200"
                >
                  <div className="space-x-2">
                    <span className="text-md">{m.name}</span>
                    <span className="opacity-50">
                      <a href={`mailto:${m.email}`} className="hover:underline">
                        {m.email}
                      </a>
                    </span>
                  </div>
                  {m.permissionLevel === "OWNER" ? (
                    <p className="opacity-50">Owner</p>
                  ) : null}
                  {permissionLevel === "OWNER" &&
                  m.permissionLevel !== "OWNER" ? (
                    <Button
                      variant="ghost"
                      type="button"
                      className="text-sm hover:bg-slate-300"
                      title="Remove User"
                    >
                      <X className="text-red-500 size-5" />
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          </Suspense>
        </Card>

        {/* {permissionLevel === "OWNER" ? (
                <Card title="Usage">
                    <Suspense fallback={<p>Loading...</p>}>
                    </Suspense>
                </Card>
            ) : null} */}
        <Card title="Apps">
          <Suspense fallback={<p>Loading...</p>}>
            <div className="overflow-y-auto h-90">
              {data.apps.map((app) => (
                <div key={`app-${orgId}-${app.id}`}>
                  <Link to={`/app/${app.id}`}>
                    <div className="w-full flex justify-between items-center p-2 pl-5 pr-3 h-14 border-b border-slate-300 first:rounded-t-md hover:bg-slate-200">
                      <p className="text-md">{app.name}</p>
                      <div className="w-24">
                        <Status status={app.status as DeploymentStatus} />
                      </div>
                    </div>
                  </Link>
                </div>
              ))}
            </div>
          </Suspense>
        </Card>
        <Card title="Danger">
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-11/12 h-11/12 flex flex-col items-center justify-center space-y-5 bg-slate-200 shadow-inner">
              {permissionLevel !== "OWNER" ? (
                <Button
                  variant="destructive"
                  className="shadow-red-700 shadow-sm disabled:shadow-none"
                >
                  Leave Organization
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    className="border border-red-400 text-bold text-red-600 hover:text-red-700 shadow-red-800 shadow-sm hover:shadow-md"
                  >
                    Transfer Ownership
                  </Button>
                  <InputConfirmDialog
                    name="Delete Organization"
                    title="Delete Organization"
                    submitName="Delete"
                    requiredText={name}
                    description={
                      <>
                        <p>This action cannot be undone.</p>
                        <ul className="*:list-disc *:ml-4 mt-2 mb-4">
                          <li>
                            Your AnvilOps organization and all associated apps,
                            deployments, and infrastructure will be deleted.
                          </li>
                          <li>
                            Your GitHub account and repositories will be
                            unaffected.
                          </li>
                        </ul>
                        <p className="mb-2">
                          Type the organization name <b>{name}</b> to continue.
                        </p>
                      </>
                    }
                    destructive={true}
                    submit={submitDelete}
                  />
                </>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

const InputConfirmDialog = ({
  name,
  title,
  submitName,
  requiredText,
  description,
  destructive,
  submit,
}: {
  name: string;
  title: string;
  submitName: string;
  requiredText?: string;
  description: React.ReactNode;
  destructive?: boolean;
  submit: (arg: string) => Promise<void>;
}) => {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        setOpen(open);
        setText("");
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant={destructive ? "destructive" : "default"}
          className="shadow-sm"
        >
          {name}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            console.log("awaiting");
            await submit(text);
            setOpen(false);
          }}
        >
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild>
            <div>
              {description}
              <Input
                value={text}
                placeholder={requiredText}
                onChange={(e) => setText(e.currentTarget.value)}
                required
              />
            </div>
          </DialogDescription>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              variant={destructive ? "destructive" : "default"}
              disabled={
                requiredText ? text !== requiredText : text.length === 0
              }
            >
              {submitName}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
