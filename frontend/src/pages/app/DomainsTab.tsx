import { useAppConfig } from "@/components/AppConfigProvider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { components } from "@/generated/openapi";
import { api } from "@/lib/api";
import { Check, Loader, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { App } from "./AppView";

type Domain = components["schemas"]["CustomDomain"];

export const DomainsTab = ({ app }: { app: App }) => {
  if (app.config.appType !== "workload") throw new Error("Unexpected app type");
  const settings = useAppConfig();
  const { data, isLoading, refetch } = api.useQuery(
    "get",
    "/app/{appId}/domains",
    {
      params: { path: { appId: app.id } },
    },
    {
      refetchInterval: (q) => {
        const shouldPoll = q.state.data?.domains?.some(
          (d) => d.status === "PENDING" || d.status === "GENERATING",
        );
        return shouldPoll ? 1000 : false;
      },
    },
  );

  const domains = data?.domains ?? [];

  const included = settings.appDomain
    ? app.config.subdomain + "." + new URL(settings.appDomain).host
    : null;

  if (isLoading) {
    return <Loader className="animate-spin" />;
  }

  return (
    <>
      <h2 className="mb-2 text-xl font-medium">Custom Domains</h2>
      {!!settings.appDomain && (
        <div className="mb-4 rounded-md border p-4">
          <div className="mb-2 flex items-center justify-between border-b pb-2">
            <h3 className="text-lg font-medium">{included}</h3>
            <span className="rounded-full border border-gray-500 px-2 py-1 text-sm text-gray-600">
              Included
            </span>
          </div>
          <p>
            This domain is included with your AnvilOps app. It doesn&apos;t need
            to be verified.
          </p>
        </div>
      )}
      <div className="mb-4 flex flex-col gap-4">
        {domains.map((domain) => (
          <DomainCard
            key={domain.id}
            domain={domain}
            invalidate={() => refetch()}
          />
        ))}
      </div>
      <AddDomainModal appId={app.id} invalidate={() => refetch()} />
    </>
  );
};

const RetryButton = ({
  domain,
  invalidate,
}: {
  domain: Domain;
  invalidate: () => void;
}) => {
  const { mutateAsync: retry, isPending } = api.useMutation(
    "post",
    "/app/{appId}/domains/{domainId}/retry",
  );

  return (
    <Button
      className="mt-2"
      onClick={async () => {
        await retry({
          params: { path: { appId: domain.appId, domainId: domain.id } },
        });
        invalidate();
      }}
      disabled={isPending}
    >
      Retry
    </Button>
  );
};

const DOMAIN_RETRY_COOLDOWN = 1000 * 60 * 5; // Keep in sync with backend/src/service/retryCertGen.ts

const DomainCard = ({
  domain,
  invalidate,
}: {
  domain: Domain;
  invalidate: () => void;
}) => {
  const { mutateAsync: verify, isPending } = api.useMutation(
    "post",
    "/app/{appId}/domains/{domainId}/verify",
  );

  const canRetry =
    domain.status === "ERROR" ||
    ((domain.status === "GENERATING" || domain.status === "PENDING") &&
      new Date().getTime() - new Date(domain.updatedAt).getTime() >
        DOMAIN_RETRY_COOLDOWN);

  return (
    <div className="rounded-md border p-4">
      <div className="mb-2 flex items-center justify-between border-b pb-2">
        <h3 className="text-lg font-medium">{domain.domain}</h3>
        {domain.status === "UNVERIFIED" ? (
          <span className="rounded-full border border-orange-500 px-2 py-1 text-sm text-orange-600">
            Verification Needed
          </span>
        ) : domain.status === "PENDING" ? (
          <span className="rounded-full border border-yellow-500 px-2 py-1 text-sm text-yellow-600">
            Pending
          </span>
        ) : domain.status === "GENERATING" ? (
          <span className="rounded-full border border-blue-500 px-2 py-1 text-sm text-blue-600">
            Generating Certificate
          </span>
        ) : domain.status === "GENERATED" ? (
          <span className="rounded-full border border-green-500 px-2 py-1 text-sm text-green-600">
            Ready
          </span>
        ) : domain.status === "ERROR" ? (
          <span className="rounded-full border border-red-500 px-2 py-1 text-sm text-red-600">
            Error
          </span>
        ) : (
          <span className="rounded-full border border-purple-500 px-2 py-1 text-sm text-purple-600">
            Unknown Status
          </span>
        )}
      </div>
      {domain.status === "UNVERIFIED" ? (
        <>
          <p>
            Before you can use your domain, it must be verified. Add the
            following DNS records and click Verify.
          </p>
          <table className="mb-4 [&_th,td]:p-2">
            <thead>
              <tr>
                <th className="text-start">Type</th>
                <th className="text-start">Name</th>
                <th className="text-start">Content</th>
              </tr>
            </thead>
            <tbody>
              {domain.dnsRecords!.map((record, i) => (
                <tr key={i}>
                  <td>{record.type}</td>
                  <td>{record.name}</td>
                  <td>
                    <code className="text-sm">{record.content}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Button
            disabled={isPending}
            onClick={async () => {
              await verify({
                params: { path: { appId: domain.appId, domainId: domain.id } },
              });
              toast.success("Domain verified!");
              invalidate();
            }}
          >
            <Check />
            Verify
          </Button>
          <p className="mt-2 text-xs">
            DNS record changes may take a few minutes to propagate.
          </p>
        </>
      ) : domain.status === "PENDING" ? (
        <p>
          Your domain has been verified, and a TLS certificate has been
          requested.
        </p>
      ) : domain.status === "GENERATING" ? (
        <p>AnvilOps is generating a TLS certificate for your domain.</p>
      ) : domain.status === "GENERATED" ? (
        <p>
          Your domain has been verified and a certificate has been generated. It
          is ready for use.
        </p>
      ) : domain.status === "ERROR" ? (
        <p>There was an unexpected issue adding this domain to your app.</p>
      ) : null}

      {canRetry && <RetryButton domain={domain} invalidate={invalidate} />}
    </div>
  );
};

const AddDomainModal = ({
  appId,
  invalidate,
}: {
  appId: number;
  invalidate: () => void;
}) => {
  const [open, setOpen] = useState(false);

  const { mutateAsync: addDomain, isPending } = api.useMutation(
    "post",
    "/app/{appId}/domains",
  );

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            onClick={() => {
              setOpen(true);
            }}
          >
            <Plus />
            Add Custom Domain
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Custom Domain</DialogTitle>
          </DialogHeader>
          <p>Use your own domain name with your AnvilOps app.</p>
          <form
            onSubmit={async (e) => {
              const form = e.currentTarget;
              e.preventDefault();
              const fd = new FormData(form);
              const domain = fd.get("domain") as string;
              if (!domain) return;
              try {
                await addDomain({
                  params: { path: { appId } },
                  body: { name: domain },
                });
                toast.success("Domain added!");
                setOpen(false);
                invalidate();
                form.reset();
              } catch (e) {
                console.error(e);
              }
            }}
          >
            <Label className="flex flex-col items-start gap-1">
              <p className="mb-0 text-sm">Domain Name</p>
              <Input name="domain" placeholder="www.example.com" />
            </Label>
            <div className="mt-4 flex justify-end">
              <Button type="submit" disabled={isPending}>
                <Plus /> Add
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};
