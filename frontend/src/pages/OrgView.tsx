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
import type { components } from "@/generated/openapi";
import { api } from "@/lib/api";
import { Check, Loader, Send, X } from "lucide-react";
import { Suspense, useContext, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Status, type DeploymentStatus } from "./app/AppView";

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

  return (
    <main className="py-10 px-4 sm:px-8">
      <h2 className="font-bold text-3xl mb-4">Your Organizations</h2>
      <InvitationsList />
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
          <p className="opacity-50 mt-4">
            You are not part of any organizations.
          </p>
        ) : (
          <>
            {user?.orgs?.map((org) => (
              <Suspense fallback={<OrgSectionFallback />} key={org.id}>
                <OrgSection
                  name={org.name}
                  orgId={org.id}
                  permissionLevel={org.permissionLevel}
                  deleteOrg={async (orgId: number) => {
                    try {
                      await deleteOrg({
                        params: { path: { orgId } },
                      });
                    } catch (e) {
                      toast.error(
                        "There was a problem deleting your organization.",
                      );
                      return;
                    }
                    toast.success("Your organization has been deleted.");
                    await refetch!({});
                  }}
                />
              </Suspense>
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
      <h4 className="text-md lg:text-lg mb-2 opacity-50">{title}</h4>
      <div className="w-full h-full bg-stone-50 rounded-md shadow-stone-300 shadow-sm">
        {children}
      </div>
    </div>
  );
};

const InvitationsList = () => {
  const { loading, refetch: refetchUser, user } = useContext(UserContext);

  const { mutateAsync: acceptInvite, isPending: acceptInvitePending } =
    api.useMutation("post", "/org/{orgId}/invitation/{invId}/accept");

  const { mutateAsync: deleteInvite, isPending: deleteInvitePending } =
    api.useMutation("delete", "/org/{orgId}/invitation/{invId}");

  if (loading || user?.receivedInvitations?.length === 0) return;

  return (
    <div className="flex flex-col gap-2 mb-4">
      {user?.receivedInvitations?.map((inv) => (
        <div className="bg-green-100 border rounded-md p-4" key={inv.id}>
          <p>
            <strong>{inv.inviter.name}</strong> has invited you to join{" "}
            <strong>{inv.org.name}</strong>.
          </p>
          <div className="flex gap-2 mt-2 items-center">
            <Button
              onClick={async () => {
                await acceptInvite({
                  params: { path: { orgId: inv.org.id, invId: inv.id } },
                });
                toast.success("Invitation accepted!");
                refetchUser!({});
              }}
              disabled={acceptInvitePending}
            >
              {acceptInvitePending ? (
                <Loader className="animate-spin" />
              ) : (
                <Check />
              )}
              Accept
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                await deleteInvite({
                  params: { path: { orgId: inv.org.id, invId: inv.id } },
                });
                toast.success("Invitation rejected!");
                refetchUser!({});
              }}
              disabled={deleteInvitePending}
            >
              {deleteInvitePending ? (
                <Loader className="animate-spin" />
              ) : (
                <X />
              )}
              Reject
            </Button>
          </div>
        </div>
      ))}
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
  deleteOrg: (id: number) => Promise<void>;
}) => {
  const { data, refetch } = api.useSuspenseQuery("get", "/org/{orgId}", {
    params: { path: { orgId } },
  });

  const { mutateAsync: invite, isPending: invitePending } = api.useMutation(
    "post",
    "/org/{orgId}/invitation",
  );

  const {
    mutateAsync: deleteInvite,
    isPending: deleteInvitePending,
    variables: deleteInvVars,
  } = api.useMutation("delete", "/org/{orgId}/invitation/{invId}");

  const {
    mutateAsync: removeUser,
    isPending: removeUserPending,
    variables: removeUserVars,
  } = api.useMutation("delete", "/org/{orgId}/user/{userId}");

  return (
    <div className="mt-8">
      <h3 className="text-xl font-medium mb-2">{name}</h3>
      <div className="flex flex-wrap lg:justify-start space-x-10 space-y-10 w-full">
        <Card title="Members">
          <div className="flex flex-col h-full justify-between">
            <div className="h-full overflow-y-auto">
              {data.members.map((m) => (
                <div
                  key={m.id}
                  className="flex justify-between items-center p-2 pl-5 pr-3 h-14 border-b border-stone-300 first:rounded-t-md hover:bg-stone-200 transition-colors"
                >
                  <div className="space-x-2">
                    <span className="text-md">{m.name}</span>
                    <span className="opacity-50">
                      <a href={`mailto:${m.email}`} className="hover:underline">
                        {m.email}
                      </a>
                    </span>
                  </div>
                  <div className="flex items-center justify-end gap-4">
                    {m.permissionLevel === "OWNER" ? (
                      <p className="opacity-50">Owner</p>
                    ) : null}
                    {permissionLevel === "OWNER" &&
                    m.permissionLevel !== "OWNER" ? (
                      <Button
                        variant="ghost"
                        type="button"
                        className="text-sm hover:bg-stone-300"
                        title="Remove User"
                        disabled={
                          removeUserPending &&
                          removeUserVars?.params?.path?.orgId === orgId &&
                          removeUserVars?.params?.path?.userId === m.id
                        }
                        onClick={async () => {
                          await removeUser({
                            params: { path: { orgId, userId: m.id } },
                          });
                          toast.success(
                            `${m.name} has been removed from ${name}.`,
                          );
                          refetch();
                        }}
                      >
                        <X className="text-red-500 size-5" />
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
              {data.outgoingInvitations.map((invite) => (
                <div
                  key={invite.id}
                  className="flex justify-between items-center p-2 pl-5 pr-3 h-14 border-b border-stone-300 first:rounded-t-md hover:bg-stone-200 transition-colors"
                >
                  <p className="text-md italic opacity-50">
                    {invite.invitee.name}
                  </p>
                  <div className="flex items-center justify-end gap-4">
                    <p className="opacity-50 italic">Invitation Sent</p>
                    <Button
                      variant="ghost"
                      type="button"
                      className="text-sm hover:bg-stone-300"
                      title="Revoke Invitation"
                      onClick={async () => {
                        await deleteInvite({
                          params: { path: { orgId, invId: invite.id } },
                        });
                        toast.success("Invitation revoked!");
                        refetch();
                      }}
                      disabled={
                        deleteInvitePending &&
                        deleteInvVars?.params?.path?.invId === invite.id
                      }
                    >
                      <X className="text-red-500 size-5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <form
              className="flex gap-2 items-center p-4"
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget as HTMLFormElement;
                const formData = new FormData(form);
                const email = formData.get("email")?.toString();
                if (!email) return;
                try {
                  await invite({
                    params: { path: { orgId } },
                    body: { email },
                  });
                  toast.success("Invitation sent!");
                  form.reset();
                } catch (e) {
                  console.error(e);
                }
                refetch();
              }}
            >
              <Input
                required
                className="bg-background"
                type="email"
                name="email"
                placeholder="Email address..."
              />
              <Button type="submit" disabled={invitePending}>
                {invitePending ? <Loader className="animate-spin" /> : <Send />}
                Invite
              </Button>
            </form>
          </div>
        </Card>
        <Card title="Apps">
          <div className="overflow-y-auto h-90">
            {data.appGroups
              .reduce(
                (appList, group) => {
                  appList.push(...group.apps);
                  return appList;
                },
                [] as components["schemas"]["AppSummary"][],
              )
              .map((app) => (
                <div key={`app-${orgId}-${app.id}`}>
                  <Link to={`/app/${app.id}`}>
                    <div className="w-full flex justify-between items-center p-2 pl-5 pr-3 h-14 border-b border-stone-300 first:rounded-t-md hover:bg-stone-200 transition-colors">
                      <p className="text-md">{app.displayName}</p>
                      <div className="w-24">
                        <Status status={app.status as DeploymentStatus} />
                      </div>
                    </div>
                  </Link>
                </div>
              ))}
          </div>
        </Card>
        <Card title="Danger">
          <div className="flex items-center justify-center p-4 size-full">
            <div className="flex flex-col items-center justify-center gap-4 bg-stone-200/50 rounded-sm shadow-inner size-full">
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
                    className="border border-red-400 text-bold text-red-600 hover:text-red-700 shadow-red-800 shadow-xs hover:shadow-sm"
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
                    submit={() => deleteOrg(orgId)}
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

const OrgSectionFallback = () => {
  return (
    <div className="mt-8">
      <h3 className="text-xl font-medium mb-2 text-black-3">
        Loading organization...
      </h3>
      <div className="flex flex-wrap lg:justify-start space-x-10 space-y-10 w-full">
        <Card title="Members">
          <div className="flex size-full items-center justify-center">
            <Loader
              className="animate-spin font-light text-black-3"
              size={50}
            />
          </div>
        </Card>

        <Card title="Apps">
          <div className="flex size-full items-center justify-center">
            <Loader
              className="animate-spin font-light text-black-3"
              size={50}
            />
          </div>
        </Card>
        <Card title="Danger">
          <div className="flex size-full items-center justify-center">
            <Loader
              className="animate-spin font-light text-black-3"
              size={50}
            />
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
