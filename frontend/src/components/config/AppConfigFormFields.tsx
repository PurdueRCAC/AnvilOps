import { useAppConfig } from "@/components/AppConfigProvider";
import { UserContext } from "@/components/UserProvider";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { components } from "@/generated/openapi";
import {
  makeFunctionalWorkloadSetter,
  makeHelmSetter,
  makeImageSetter,
} from "@/lib/form";
import type { CommonFormFields, GroupFormFields } from "@/lib/form.types";
import { Cable } from "lucide-react";
import { useContext } from "react";
import { ProjectConfig } from "./ProjectConfig";
import { HelmConfigFields } from "./helm/HelmConfigFields";
import { CommonWorkloadConfigFields } from "./workload/CommonWorkloadConfigFields";
import { GitConfigFields } from "./workload/git/GitConfigFields";
import { ImageConfigFields } from "./workload/image/ImageConfigFields";

export const AppConfigFormFields = ({
  groupState,
  state,
  setState,
  disabled,
  originalConfig,
}: {
  groupState: GroupFormFields;
  state: CommonFormFields;
  setState: (updater: (prev: CommonFormFields) => CommonFormFields) => void;
  disabled?: boolean;
  originalConfig?: components["schemas"]["DeploymentConfig"];
}) => {
  const appConfig = useAppConfig();

  const { user } = useContext(UserContext);
  const selectedOrg =
    groupState.orgId !== undefined
      ? user?.orgs?.find((it) => it.id === groupState.orgId)
      : undefined;

  const imageSetter = makeImageSetter(setState);

  const helmSetter = makeHelmSetter(setState);

  const commonWorkloadSetter = makeFunctionalWorkloadSetter(setState);

  return (
    <>
      {appConfig.isRancherManaged && (
        <ProjectConfig state={state} setState={setState} disabled={disabled} />
      )}
      <h3 className="mt-4 font-bold pb-1 border-b">Source Options</h3>
      <div className="space-y-2">
        <div className="flex items-baseline gap-2">
          <Label htmlFor="deploymentSource" className="pb-1">
            <Cable className="inline" size={16} />
            Deployment Source
          </Label>
          <span
            className="text-red-500 cursor-default"
            title="This field is required."
          >
            *
          </span>
        </div>
        <Select
          required
          disabled={disabled}
          value={state.source ?? ""}
          onValueChange={(source) =>
            setState((prev) => ({
              ...prev,
              source: source as "git" | "image" | "helm",
              appType: source === "helm" ? "helm" : "workload",
            }))
          }
          name="source"
        >
          <SelectTrigger className="w-full" id="deploymentSource">
            <SelectValue placeholder="Select deployment source" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="git">Git Repository</SelectItem>
              <SelectItem value="image">OCI Image</SelectItem>
              {/* appConfig.allowHelmDeployments && <SelectItem value="helm">Helm Chart</SelectItem> */}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      {state.source === "git" && selectedOrg && (
        <GitConfigFields
          selectedOrg={selectedOrg}
          gitState={state.workload.git}
          setState={setState}
          disabled={disabled}
        />
      )}
      {state.source === "image" && (
        <ImageConfigFields
          imageState={state.workload.image}
          setImageState={imageSetter}
          disabled={disabled}
        />
      )}
      {state.source === "helm" && (
        <HelmConfigFields
          state={state.helm}
          setState={helmSetter}
          disabled={disabled}
        />
      )}
      {state.appType === "workload" &&
        (state.source !== "git" || selectedOrg?.githubConnected) && (
          <CommonWorkloadConfigFields
            appState={state}
            setState={commonWorkloadSetter}
            disabled={disabled}
            originalConfig={originalConfig}
          />
        )}
    </>
  );
};
