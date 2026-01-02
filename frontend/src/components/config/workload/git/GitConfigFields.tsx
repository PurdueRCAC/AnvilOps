import { EnabledGitConfigFields } from "./EnabledGitConfigFields";
import type { components } from "@/generated/openapi";
import type { CommonFormFields, GitFormFields } from "@/lib/form.types";
import { GitHubIcon } from "@/pages/create-app/CreateAppView";
import { Button } from "@/components/ui/button";

export const GitConfigFields = ({
  selectedOrg,
  gitState,
  setState,
  disabled,
}: {
  selectedOrg: components["schemas"]["UserOrg"];
  gitState: GitFormFields;
  setState: (updater: (prev: CommonFormFields) => CommonFormFields) => void;
  disabled?: boolean;
}) => {
  if (!selectedOrg?.githubConnected) {
    if (selectedOrg?.permissionLevel === "OWNER") {
      return (
        <div>
          <p className="mt-4">
            <strong>{selectedOrg?.name}</strong> has not been connected to
            GitHub.
          </p>
          <p className="mb-4">
            AnvilOps integrates with GitHub to deploy your app as soon as you
            push to your repository.
          </p>
          <a
            className="flex w-full"
            href={`/api/org/${selectedOrg?.id}/install-github-app`}
          >
            <Button className="w-full" type="button">
              <GitHubIcon />
              Install GitHub App
            </Button>
          </a>
        </div>
      );
    } else {
      return (
        <p className="my-4">
          <strong>{selectedOrg?.name}</strong> has not been connected to GitHub.
          Ask the owner of your organization to install the AnvilOps GitHub App.
        </p>
      );
    }
  }

  return (
    <EnabledGitConfigFields
      orgId={selectedOrg.id}
      gitState={gitState}
      setState={setState}
      disabled={disabled}
    />
  );
};
