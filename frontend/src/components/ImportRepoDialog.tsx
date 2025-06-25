import { api } from "@/lib/api";
import { Loader, X } from "lucide-react";
import { useState, type Dispatch } from "react";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export const ImportRepoDialog = ({
  orgId,
  open,
  setOpen,
}: {
  orgId: number;
  open: boolean;
  setOpen: Dispatch<boolean>;
}) => {
  const { data: installation } = api.useQuery(
    "get",
    "/org/{orgId}/installation",
    { params: { path: { orgId: orgId } } },
  );

  const { mutateAsync: importRepo, isPending } = api.useMutation(
    "post",
    "/org/{orgId}/import-repo/create-state",
  );

  const { data: repos } = api.useQuery("get", "/org/{orgId}/repos", {
    params: { path: { orgId } },
  });

  const [repoName, setRepoName] = useState("");

  const repoAlreadyExists = repos?.some(
    (it) => it.owner === installation?.targetName && it.name === repoName,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Git Repository</DialogTitle>
        </DialogHeader>
        <p className="mb-4">
          Create a new repository on your GitHub account or organization from an
          existing repository.
        </p>
        <form
          className="contents"
          onSubmit={async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const formData = new FormData(e.currentTarget);
            if (!installation) return;
            const result = await importRepo({
              body: {
                destIsOrg: installation.targetType === "Organization",
                destOwner: installation.targetName!,
                destRepo: formData.get("destRepoName")!.toString(),
                makePrivate: !!formData.get("makePrivate"),
                sourceURL: formData.get("srcRepoURL")!.toString(),
              },
              params: { path: { orgId } },
            });
            if (!window.open(result.url, "_blank")) {
              window.location.href = result.url;
            }
            setOpen(false);
          }}
        >
          <Label htmlFor="srcRepoURL">Source Repository URL</Label>
          <Input
            id="srcRepoURL"
            name="srcRepoURL"
            type="url"
            placeholder="https://github.com/octocat/Hello-World"
            required
          />
          <div className="grid grid-cols-[1fr_min-content_1fr] gap-2">
            <Label htmlFor="destOwner" className="col-span-2">
              Owner
            </Label>
            <Label htmlFor="destRepoName">New Repository Name</Label>
            <Input
              type="text"
              id="destOwner"
              name="destOwner"
              value={installation?.targetName}
              disabled
              required
            />
            <span className="opacity-50 text-xl">/</span>
            <Input
              id="destRepoName"
              name="destRepoName"
              placeholder="Hello-World"
              value={repoName}
              onChange={(e) => setRepoName(e.currentTarget.value)}
              required
            />
            {repoAlreadyExists ? (
              <span className="flex items-center text-red-500 font-medium col-span-full my-2 gap-1">
                <X />A repository already exists with that name.
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="makePrivate" name="makePrivate" defaultChecked />
            <Label htmlFor="makePrivate">Make new repository private</Label>
          </div>
          <Button type="submit" className="mt-2" disabled={repoAlreadyExists}>
            {isPending ? (
              <>
                <Loader className="animate-spin" /> Importing...
              </>
            ) : (
              <>Import</>
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};
