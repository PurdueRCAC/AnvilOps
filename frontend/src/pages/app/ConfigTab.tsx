import { useAppConfig } from "@/components/AppConfigProvider";
import HelpTooltip from "@/components/HelpTooltip";
import { UserContext } from "@/components/UserProvider";
import { AppConfigFormFields } from "@/components/config/AppConfigFormFields";
import { GroupConfigFields } from "@/components/config/GroupConfigFields";
import { ProjectConfig } from "@/components/config/ProjectConfig";
import { Button } from "@/components/ui/button";
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
  refetch: (options: RefetchOptions | undefined) => Promise<any>;
}) => {
  if (!isWorkloadConfig(app.config)) {
    return (
      <div className="text-center py-8">
        <p>Configuration editing is not available for Helm-based apps.</p>
      </div>
    );
  }

  const appConfig = useAppConfig();
  const [state, setState] = useState<CommonFormFields>(
    getFormStateFromApp(app),
  );
  const [groupState, setGroupState] = useState<GroupFormFields>(
    getGroupStateFromApp(app),
  );

  const { mutateAsync: updateApp, isPending: updatePending } = api.useMutation(
    "put",
    "/app/{appId}",
  );

  const { user } = useContext(UserContext);

  const enableSaveButton =
    state.source !== "git" ||
    user?.orgs?.find((it) => it.id === app.orgId)?.githubConnected;

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
            projectId:
              state.projectId && state.projectId !== app.projectId
                ? state.projectId
                : undefined,
            config: createDeploymentConfig(finalAppState),
          },
        });
        if (tab === "configuration") {
          setTab("overview");
        }
        refetch({});
      }}
      className="flex flex-col gap-8"
    >
      <div>
        <div className="flex items-baseline gap-2 mb-2">
          <Label className="pb-1">
            <TextCursorInput className="inline" size={16} /> App Name
          </Label>
          <span
            className="text-red-500 cursor-default"
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
        <div className="flex items-baseline gap-2 mb-2">
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
            className="text-red-500 cursor-default"
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
      {appConfig?.isRancherManaged && (
        <ProjectConfig state={state} setState={setState} />
      )}
      <FormContext value="UpdateApp">
        <AppConfigFormFields
          groupState={groupState}
          state={state}
          setState={setState}
          originalConfig={app.config}
        />
      </FormContext>
      {enableSaveButton && (
        <Button className="mt-8 max-w-max" disabled={updatePending}>
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
      )}
    </form>
  );
};
