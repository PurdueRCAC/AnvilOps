import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import type { CommonFormFields } from "@/lib/form.types";
import { FormContext } from "@/pages/create-app/CreateAppView";
import { Info, Library, Loader, X } from "lucide-react";
import { useContext, useState, type Dispatch } from "react";
import { toast } from "sonner";

export const ImportRepoDialog = ({
  orgId,
  open,
  setOpen,
  refresh,
  setState,
}: {
  orgId: number;
  open: boolean;
  setOpen: Dispatch<boolean>;
  refresh: () => Promise<void>;
  setState: (updater: (prev: CommonFormFields) => CommonFormFields) => void;
}) => {
  const setRepo = (id: number, name: string) => {
    console.log("setRepo", id, name);
    setState((s) => ({
      ...s,
      workload: {
        ...s.workload,
        git: {
          ...s.workload.git,
          repositoryId: id,
          repoName: name,
        },
      },
    }));
  };

  const { data: installation } = api.useQuery(
    "get",
    "/org/{orgId}/installation",
    { params: { path: { orgId: orgId } } },
    { enabled: open },
  );

  const { mutateAsync: importRepo, isPending } = api.useMutation(
    "post",
    "/org/{orgId}/import-repo/create-state",
  );

  const { data: repos } = api.useQuery("get", "/org/{orgId}/repos", {
    params: { path: { orgId } },
  });

  const { data: templates, isPending: templatesLoading } = api.useQuery(
    "get",
    "/templates",
    {},
    {
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    },
  );

  const [templateSelect, setTemplateSelect] = useState<string>("");
  const [showRepoOptions, setShowRepoOptions] = useState(false);
  const [repoState, setRepoState] = useState({
    url: "",
    name: "",
  });
  const repoAlreadyExists = repos?.some(
    (it) => it.owner === installation?.targetName && it.name === repoState.name,
  );

  const handleOpenChange = (open: boolean) => {
    setOpen(open);
    if (open === false) {
      setRepoState({ url: "", name: "" });
      setTemplateSelect("");
      setShowRepoOptions(false);
    }
  };

  const formContext = useContext(FormContext);
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
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
            if ("url" in result) {
              window.location.href = result.url;
            } else if ("repoId" in result) {
              // We were able to create the repo immediately without creating a popup for GitHub authorization
              const repoId = result.repoId;
              await refresh();
              // Set the repo after the <Select> rerenders with the updated list of repositories
              setTimeout(() => setRepo(repoId, repoState.name));
            }
            handleOpenChange(false);
            if (
              templateSelect &&
              templateSelect !== "$new-repo" &&
              templates?.[templateSelect]
            ) {
              const template = templates[templateSelect];
              setState((state) => ({
                ...state,
                port: template.port,
                builder: template.builder,
                dockerfilePath: template.dockerfilePath,
                ...(formContext !== "UpdateApp" && {
                  // Do not autofill subdomain if updating instead of creating the app!
                  // https://stackoverflow.com/a/38622545
                  subdomain:
                    template.subdomain +
                    "-" +
                    Math.random().toString(36).slice(2, 7),
                }),
                env: template.env,
                mounts: template.mounts,
              }));
              toast.info("Autofilled form fields.");
            }
          }}
        >
          <Label htmlFor="srcRepoTemplate">Select a Template</Label>
          <div>
            <Select
              name="srcRepoTemplate"
              value={templateSelect}
              onValueChange={(value) => {
                if (value === "$new-repo") {
                  setRepoState({
                    name: "",
                    url: "",
                  });
                  setShowRepoOptions(true);
                } else {
                  setRepoState({
                    name: value ?? "",
                    url: templates?.[value].url ?? "",
                  });
                  setShowRepoOptions(true);
                }
                setTemplateSelect(value);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Import a Git repository" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>AnvilOps Templates</SelectLabel>
                  {!templatesLoading &&
                    Object.keys(templates ?? {}).map((templateName) => (
                      <SelectItem key={templateName} value={templateName}>
                        {templates?.[templateName].displayName}
                      </SelectItem>
                    ))}
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>Custom</SelectLabel>
                  <SelectItem value="$new-repo">Import custom...</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            {templateSelect && templateSelect !== "$new-repo" && (
              <div className="m-1 text-black-3 text-sm">
                <p className="flex items-center gap-1">
                  <Library className="inline" size={16} />
                  {templates?.[templateSelect].description}
                </p>
                <p className="flex items-center gap-1">
                  {" "}
                  <Info className="inline" size={16} />
                  For information on using the template, check the{" "}
                  <a
                    className="underline"
                    target="_blank"
                    href={templates?.[templateSelect].url}
                  >
                    main page.
                  </a>
                </p>
              </div>
            )}
          </div>
          {showRepoOptions && (
            <>
              <Label htmlFor="srcRepoURL">Source Repository URL</Label>
              <Input
                id="srcRepoURL"
                name="srcRepoURL"
                type="url"
                placeholder="https://github.com/octocat/Hello-World"
                value={repoState.url}
                onChange={(e) => {
                  if (templateSelect === "$new-repo") {
                    setRepoState({ ...repoState, url: e.currentTarget.value });
                  }
                }}
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
                  value={repoState.name}
                  onChange={(e) =>
                    setRepoState({ ...repoState, name: e.currentTarget.value })
                  }
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
              <Button
                type="submit"
                className="mt-2"
                disabled={repoAlreadyExists}
              >
                {isPending ? (
                  <>
                    <Loader className="animate-spin" /> Importing...
                  </>
                ) : (
                  <>Import</>
                )}
              </Button>
            </>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
};
