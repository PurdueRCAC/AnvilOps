import HelpTooltip from "@/components/HelpTooltip";
import { UserContext } from "@/components/UserProvider";
import { AppConfigFormFields } from "@/components/config/AppConfigFormFields";
import { GroupConfigFields } from "@/components/config/GroupConfigFields";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import {
  createDeploymentConfig,
  getFormStateFromApp,
  getGroupStateFromApp,
} from "@/lib/form";
import type { CommonFormFields, GroupFormFields } from "@/lib/form.types";
import { isWorkloadConfig } from "@/lib/utils";
import type { RefetchOptions } from "@tanstack/react-query";
import { Loader, Save, Scale3D, TextCursorInput } from "lucide-react";
import { useContext, useState, type Dispatch } from "react";
import { FormContext } from "../create-app/CreateAppView";
import type { App } from "./AppView";

export const ConfigTab = ({
  app,
  tab,
  setTab,
  refetch,
}: {
  app: App;
  tab: string;
  setTab: Dispatch<string>;
  refetch: (options: RefetchOptions | undefined) => Promise<unknown>;
}) => {
  const [state, setState] = useState<CommonFormFields>(
    getFormStateFromApp(app),
  );
  const [groupState, setGroupState] = useState<GroupFormFields>(
    getGroupStateFromApp(app),
  );

  const [forceRebuild, setForceRebuild] = useState(false);

  const rebuildRequired = isRebuildRequired(app, state);

  const { mutateAsync: updateApp, isPending: updatePending } = api.useMutation(
    "put",
    "/app/{appId}",
  );

  const { user } = useContext(UserContext);

  if (!isWorkloadConfig(app.config)) {
    return (
      <div className="py-8 text-center">
        <p>Configuration editing is not available for Helm-based apps.</p>
      </div>
    );
  }

  const enableSaveButton =
    state.source !== "git" ||
    user?.orgs?.find((it) => it.id === app.orgId)?.gitProvider !== null;

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const finalAppState = state as Required<CommonFormFields>;
        await updateApp({
          params: { path: { appId: app.id } },
          body: {
            displayName: state.displayName,
            appGroup: groupState.groupOption,
            projectId: state.projectId ?? undefined,
            config: createDeploymentConfig(finalAppState),
            forceRebuild,
          },
        });
        if (tab === "configuration") {
          setTab("overview");
        }
        void refetch({});
      }}
      className="flex flex-col gap-8"
    >
      <div>
        <div className="mb-2 flex items-baseline gap-2">
          <Label className="pb-1">
            <TextCursorInput className="inline" size={16} /> App Name
          </Label>
          <span
            className="cursor-default text-red-500"
            title="This field is required."
          >
            *
          </span>
        </div>
        <Input
          name="name"
          required
          value={state.displayName}
          onChange={(e) =>
            setState((s) => ({ ...s, displayName: e.target.value }))
          }
        />
      </div>
      <div>
        <div className="mb-2 flex items-baseline gap-2">
          <Label className="pb-1">
            <Scale3D className="inline" size={16} /> Replicas
          </Label>
          <HelpTooltip size={16}>
            <p>
              The number of instances of your application running at once.
              Having multiple replicas improves fault tolerance and improves
              performance by distributing traffic.
            </p>
          </HelpTooltip>
          <span
            className="cursor-default text-red-500"
            title="This field is required."
          >
            *
          </span>
        </div>
        <Input
          name="replicas"
          placeholder="1"
          type="number"
          required
          value={state.workload?.replicas ?? "1"}
          onChange={(e) => {
            const value = e.target.value;
            setState((s) => ({
              ...s,
              workload: { ...s.workload, replicas: value },
            }));
          }}
        />
      </div>
      <GroupConfigFields state={groupState} setState={setGroupState} />
      <FormContext value="UpdateApp">
        <AppConfigFormFields
          groupState={groupState}
          state={state}
          setState={setState}
          originalConfig={app.config}
        />
      </FormContext>
      {enableSaveButton && (
        <>
          <Label className="mt-8 flex items-start gap-2">
            <Checkbox
              disabled={rebuildRequired}
              checked={forceRebuild || rebuildRequired}
              onCheckedChange={(checked) => {
                setForceRebuild(!!checked);
              }}
            />
            <div className="flex flex-col gap-2">
              Rebuild my application
              <span className="text-sm text-gray-500">
                {rebuildRequired ? (
                  <>
                    A new build is required due to the settings you&apos;ve
                    changed.
                  </>
                ) : (
                  <>
                    Build a new version of your application using this updated
                    configuration.
                  </>
                )}
              </span>
            </div>
          </Label>
          <Button type="submit" className="max-w-max" disabled={updatePending}>
            {updatePending ? (
              <>
                <Loader className="animate-spin" /> Saving...
              </>
            ) : (
              <>
                <Save /> Save
              </>
            )}
          </Button>
        </>
      )}
    </form>
  );
};

// Keep in sync with the shouldBuildOnUpdate function in backend/src/service/updateApp.ts
function isRebuildRequired(app: App, state: CommonFormFields) {
  const oldConfig = app.config;
  const newConfig = state.workload.git;

  const { data: currentDeployment } = api.useQuery(
    "get",
    "/app/{appId}/deployments/{deploymentId}",
    { params: { path: { appId: app.id, deploymentId: app.activeDeployment } } },
    { enabled: !!app.activeDeployment },
  );

  // Only Git apps need to be built
  if (state.appType !== "workload" || state.source !== "git") {
    return false;
  }

  // Either this app has not been built in the past, or it has not been built successfully
  if (oldConfig.source !== "git" || currentDeployment?.status === "ERROR") {
    return true;
  }

  // The code has changed
  if (
    newConfig.branch !== oldConfig.branch ||
    newConfig.repositoryId != oldConfig.repositoryId
  ) {
    return true;
  }

  // Build options have changed
  if (
    newConfig.builder != oldConfig.builder ||
    newConfig.rootDir != oldConfig.rootDir ||
    (newConfig.builder === "dockerfile" &&
      newConfig.dockerfilePath != oldConfig.dockerfilePath)
  ) {
    return true;
  }

  return false;
}
