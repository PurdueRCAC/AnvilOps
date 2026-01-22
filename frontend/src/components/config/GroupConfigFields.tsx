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
import type { GroupFormFields } from "@/lib/form.types";
import { Component, X } from "lucide-react";
import { useMemo, type Dispatch, type SetStateAction } from "react";

export const GroupConfigFields = ({
  state,
  setState,
  disabled,
}: {
  state: GroupFormFields;
  setState: Dispatch<SetStateAction<GroupFormFields>>;
  disabled?: boolean;
}) => {
  const { orgId, groupOption } = state;
  const { data: groups, isPending: groupsLoading } = api.useQuery(
    "get",
    "/org/{orgId}/groups",
    { params: { path: { orgId: orgId! } } },
    {
      enabled: orgId !== undefined,
    },
  );

  const multiGroups = groups?.filter((group) => !group.isMono);
  const groupName =
    groupOption?.type === "create-new" ? groupOption.name : undefined;

  const shouldDisplayGroupNameError = useMemo(() => {
    const MAX_GROUP_LENGTH = 56;
    if (!groupName) return true;
    return (
      groupName.length > MAX_GROUP_LENGTH ||
      !groupName.match(/^[a-zA-Z0-9][ a-zA-Z0-9-_.]*$/)
    );
  }, [groupName]);

  return (
    <>
      <h3 className="mt-4 border-b pb-1 font-bold">Grouping Options</h3>
      <div className="space-y-2">
        <div className="flex items-baseline gap-2">
          <Label htmlFor="selectGroup" className="pb-1">
            <Component className="inline" size={16} />
            Group
          </Label>
          <span
            className="cursor-default text-red-500"
            title="This field is required."
          >
            *
          </span>
        </div>
        <p className="text-black-2 text-sm">
          Applications can be created as standalone apps, or as part of a group
          of related microservices.
        </p>
        <Select
          required
          disabled={disabled || orgId === undefined || groupsLoading}
          onValueChange={(option) => {
            if (option === "create-new") {
              setState({
                ...state,
                groupOption: { type: "create-new", name: "" },
              });
            } else if (option === "standalone") {
              setState({ ...state, groupOption: { type: "standalone" } });
            } else {
              setState({
                ...state,
                groupOption: { type: "add-to", id: parseInt(option) },
              });
            }
          }}
          value={
            groupOption?.type === "add-to"
              ? groupOption.id.toString()
              : groupOption?.type
          }
          name="group"
        >
          <SelectTrigger className="w-full" id="selectGroup">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="standalone">Standalone app</SelectItem>
              <SelectItem value="create-new">Create new group</SelectItem>
              {multiGroups && multiGroups.length > 0 && (
                <>
                  <SelectLabel key="add-label">
                    Add to existing group
                  </SelectLabel>
                  {multiGroups?.map((group) => (
                    <SelectItem key={group.id} value={group.id.toString()}>
                      {group.name}
                    </SelectItem>
                  ))}
                </>
              )}
            </SelectGroup>
          </SelectContent>
        </Select>

        {groupOption?.type === "create-new" && (
          <>
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
              disabled={disabled}
              placeholder="Group name"
              name="groupName"
              value={groupName}
              onChange={(e) =>
                setState({
                  ...state,
                  groupOption: { ...groupOption, name: e.currentTarget.value },
                })
              }
              autoComplete="off"
            />
            {groupName && shouldDisplayGroupNameError && (
              <div className="flex gap-5 text-sm">
                <X className="text-red-500" />
                <ul className="text-black-3 list-disc">
                  <li>A group name must have 56 or fewer characters.</li>
                  <li>
                    A group name must contain only alphanumeric characters,
                    dashes, underscores, dots, and spaces.
                  </li>
                  <li>
                    A group name must start with an alphanumeric character.
                  </li>
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
};
