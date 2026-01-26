import { UserContext } from "@/components/UserProvider";
import { Label } from "@/components/ui/label";
import { SelectContent, SelectGroup, SelectItem } from "@/components/ui/select";
import {
  getFormStateFromApp,
  makeFunctionalWorkloadSetter,
  makeGitSetter,
  makeHelmSetter,
  makeImageSetter,
} from "@/lib/form";
import type { CommonFormFields } from "@/lib/form.types";
import { Cable } from "lucide-react";
import { useContext } from "react";
import type { App } from "../../pages/app/AppView";
import { DiffSelect } from "./DiffSelect";
import { HelmConfigDiff } from "./helm/HelmConfigDiff";
import { CommonWorkloadConfigDiff } from "./workload/CommonWorkloadConfigDiff";
import { GitConfigDiff } from "./workload/git/GitConfigDiff";
import { ImageConfigDiff } from "./workload/image/ImageConfigDiff";

export const AppConfigDiff = ({
  orgId,
  base,
  state,
  setState,
  disabled = false,
}: {
  orgId: number;
  base: App;
  state: Omit<CommonFormFields, "displayName">;
  setState: (callback: (state: CommonFormFields) => CommonFormFields) => void;
  disabled?: boolean;
}) => {
  const { user } = useContext(UserContext);
  // const appConfig = useAppConfig();
  const selectedOrg = orgId
    ? user?.orgs?.find((it) => it.id === orgId)
    : undefined;

  const baseFormState = getFormStateFromApp(base);

  const setImageState = makeImageSetter(setState);
  const setGitState = makeGitSetter(setState);
  const setHelmState = makeHelmSetter(setState);
  const setWorkloadState = makeFunctionalWorkloadSetter(setState);

  return (
    <div className="flex flex-col gap-8">
      <h3 className="mt-4 border-b pb-1 font-bold">Source Options</h3>
      <div className="space-y-2">
        <div className="flex items-baseline gap-2">
          <Label htmlFor="deploymentSource" className="pb-1">
            <Cable className="inline" size={16} />
            Deployment Source
          </Label>
          <span
            className="cursor-default text-red-500"
            title="This field is required."
          >
            *
          </span>
        </div>
        <div className="flex items-center gap-8">
          <DiffSelect
            required
            disabled={disabled}
            left={baseFormState.source}
            right={state.source}
            setRight={(source) =>
              setState((prev) => ({
                ...prev,
                source: source as "helm" | "git" | "image",
              }))
            }
            leftPlaceholder="Select deployment source"
            rightPlaceholder="Select deployment source"
          >
            <SelectContent>
              <SelectGroup>
                <SelectItem value="git">Git Repository</SelectItem>
                <SelectItem value="image">OCI Image</SelectItem>
                {/* {appConfig.allowHelmDeployments && <SelectItem value="helm">Helm Chart</SelectItem>} */}
              </SelectGroup>
            </SelectContent>
          </DiffSelect>
        </div>
      </div>

      {state.source === "git" && (
        <GitConfigDiff
          disabled={disabled}
          selectedOrg={selectedOrg}
          base={baseFormState}
          gitState={state.workload.git}
          setGitState={setGitState}
        />
      )}
      {state.source === "image" && (
        <ImageConfigDiff
          disabled={disabled}
          base={baseFormState}
          imageState={state.workload.image}
          setImageState={setImageState}
        />
      )}

      {state.source === "helm" && (
        <HelmConfigDiff
          disabled={disabled}
          base={baseFormState}
          helmState={state.helm}
          setHelmState={setHelmState}
        />
      )}
      {state.appType === "workload" &&
        (state.source !== "git" || selectedOrg?.gitProvider !== null) && (
          <CommonWorkloadConfigDiff
            disabled={disabled}
            base={baseFormState}
            workloadState={state.workload}
            setWorkloadState={setWorkloadState}
          />
        )}
    </div>
  );
};
