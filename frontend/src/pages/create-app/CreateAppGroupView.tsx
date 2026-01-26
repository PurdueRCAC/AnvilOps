import { AppConfigFormFields } from "@/components/config/AppConfigFormFields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserContext } from "@/components/UserProvider";
import { api } from "@/lib/api";
import {
  createDefaultCommonFormFields,
  createNewAppWithoutGroup,
  getAppName,
} from "@/lib/form";
import type { CommonFormFields, GroupFormFields } from "@/lib/form.types";
import { Globe, Loader, Plus, Rocket, X } from "lucide-react";
import { Fragment, useContext, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { FormContext } from "./CreateAppView";

type GroupCreate = { type: "create-new"; name: string };
export default function CreateAppGroupView() {
  const { user } = useContext(UserContext);

  const { mutateAsync: createAppGroup, isPending: createPending } =
    api.useMutation("post", "/app/group");

  const [groupState, setGroupState] = useState<GroupFormFields>({
    orgId: user?.orgs?.[0]?.id,
    groupOption: { type: "create-new", name: "" },
  });

  const {
    orgId,
    groupOption: { name: groupName },
  } = groupState as { orgId?: number; groupOption: GroupCreate };

  const [appStates, setAppStates] = useState<CommonFormFields[]>([
    createDefaultCommonFormFields(),
  ]);
  const [tab, setTab] = useState("0");

  const navigate = useNavigate();
  const shouldShowDeploy = useMemo(() => {
    return (
      orgId === undefined ||
      user?.orgs?.some((org) => org.id === orgId && org.gitProvider !== null)
    );
  }, [user, orgId]);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const showGroupNameError = useMemo(() => {
    const MAX_GROUP_LENGTH = 56;
    return (
      groupName.length > 0 &&
      (groupName.length > MAX_GROUP_LENGTH ||
        !groupName.match(/^[a-zA-Z0-9][ a-zA-Z0-9-_.]*$/))
    );
  }, [groupName]);

  return (
    <div className="mx-auto flex max-w-prose">
      <form
        className="my-10 flex w-full flex-col gap-6"
        onSubmit={async (e) => {
          e.preventDefault();
          // const formData = new FormData(e.currentTarget);

          // TODO: client-side validation on every app state
          const finalAppStates = appStates as Required<CommonFormFields>[];
          try {
            await createAppGroup({
              body: {
                name: groupName,
                orgId: orgId!,
                apps: finalAppStates.map(createNewAppWithoutGroup),
              },
            });

            navigate("/dashboard");
          } catch (err) {
            console.error(err);
            toast.error((err as Error).message);
          }
        }}
      >
        <h2 className="mb-4 text-3xl font-bold">Create a Group</h2>
        <div className="space-y-2">
          <div className="flex items-baseline gap-2">
            <Label htmlFor="selectOrg" className="pb-1">
              <Globe className="inline" size={16} />
              Organization
            </Label>
            <span
              className="cursor-default text-red-500"
              title="This field is required."
            >
              *
            </span>
          </div>
          <Select
            required
            onValueChange={(orgId) =>
              setGroupState((prev) => ({ ...prev, orgId: parseInt(orgId) }))
            }
            value={orgId?.toString()}
            name="org"
          >
            <SelectTrigger className="w-full" id="selectOrg">
              <SelectValue placeholder="Select an organization" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {user?.orgs?.map((org) => (
                  <SelectItem key={org.id} value={org.id.toString()}>
                    {org.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <div className="flex items-baseline gap-2">
            <Label htmlFor="groupName" className="pb-1">
              Group Name
            </Label>
            <span
              className="cursor-default text-red-500"
              title="This field is required."
            >
              *
            </span>
          </div>
          <Input
            required
            placeholder="Group name"
            name="groupName"
            value={groupName}
            onChange={(e) => {
              const value = e.currentTarget.value;
              setGroupState((prev) => ({
                ...prev,
                groupOption: { type: "create-new", name: value },
              }));
            }}
            autoComplete="off"
          />
          {showGroupNameError && (
            <div className="flex gap-5 text-sm">
              <X className="text-red-500" />
              <ul className="text-black-3 list-disc">
                <li>A group name must have 56 or fewer characters.</li>
                <li>
                  A group name must contain only alphanumeric characters,
                  dashes, underscores, dots, and spaces.
                </li>
                <li>A group name must start with an alphanumeric character.</li>
              </ul>
            </div>
          )}
        </div>
        <Tabs value={tab} onValueChange={setTab}>
          <div className="relative my-4">
            <div ref={scrollRef} className="overflow-x-auto overflow-y-clip">
              <TabsList className="w-fit">
                {appStates.map((_, idx) => (
                  <Fragment key={`tab-${idx}`}>
                    <TabsTrigger
                      value={idx.toString()}
                      disabled={orgId === undefined}
                    >
                      <span>{getAppName(appStates[idx])}</span>
                    </TabsTrigger>
                    <button type="button" key={`close-${idx}`}>
                      <X
                        className="inline size-3 stroke-3"
                        onClick={() => {
                          if (appStates.length > 1) {
                            setAppStates((appStates) =>
                              appStates.filter((_, i) => i !== idx),
                            );
                            if (tab === idx.toString()) {
                              const side = idx - 1 > 0 ? idx - 1 : 0;
                              setTab(side.toString());
                            }
                          }
                        }}
                      />
                    </button>
                  </Fragment>
                ))}
                <Button
                  key="addApp"
                  variant="ghost"
                  type="button"
                  onClick={() => {
                    setAppStates((appStates) =>
                      appStates.concat(createDefaultCommonFormFields()),
                    );
                  }}
                  disabled={orgId === undefined}
                >
                  <Plus className="size-4 stroke-3" />
                </Button>
              </TabsList>
            </div>
          </div>
          <FormContext value="CreateAppGroup">
            {appStates.map((app, idx) => (
              <TabsContent
                key={idx}
                value={idx.toString()}
                className="space-y-8"
              >
                <AppConfigFormFields
                  groupState={groupState}
                  state={app}
                  setState={(updater) => {
                    setAppStates((appStates) =>
                      appStates.map((appState, i) =>
                        i === idx ? updater(appState) : appState,
                      ),
                    );
                  }}
                />
              </TabsContent>
            ))}
          </FormContext>
        </Tabs>
        {shouldShowDeploy ? (
          <Button size="lg" type="submit">
            {createPending ? (
              <>
                <Loader className="animate-spin" /> Deploying...
              </>
            ) : (
              <>
                <Rocket />
                Deploy
              </>
            )}
          </Button>
        ) : null}
      </form>
    </div>
  );
}
