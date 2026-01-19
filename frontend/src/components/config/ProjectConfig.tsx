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
import type { CommonFormFields } from "@/lib/form.types";
import { Fence } from "lucide-react";
import { useContext } from "react";

export const ProjectConfig = ({
  state,
  setState,
  disabled,
}: {
  state: CommonFormFields;
  setState: (updater: (prev: CommonFormFields) => CommonFormFields) => void;
  disabled?: boolean;
}) => {
  const { user } = useContext(UserContext);

  return (
    <div className="space-y-2">
      <div>
        <div className="flex items-baseline gap-2">
          <Label htmlFor="selectProject" className="pb-1">
            <Fence className="inline" size={16} />
            Project
          </Label>
          <span
            className="cursor-default text-red-500"
            title="This field is required."
          >
            *
          </span>
        </div>
        <p className="text-black-3 text-sm">
          In clusters managed by Rancher, resources are organized into projects
          for administration.
        </p>
      </div>
      <Select
        required
        disabled={disabled}
        name="project"
        value={state.projectId ?? ""}
        onValueChange={(projectId) =>
          setState((prev) => ({ ...prev, projectId }))
        }
      >
        <SelectTrigger className="w-full" id="selectProject">
          <SelectValue placeholder="Select a Project" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {user?.projects?.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                <p>
                  {project.name}{" "}
                  <span className="text-black-2 text-sm">
                    {project.description}
                  </span>
                </p>
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
};
