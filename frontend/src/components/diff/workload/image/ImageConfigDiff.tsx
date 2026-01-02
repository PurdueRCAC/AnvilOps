import type { CommonFormFields, ImageFormFields } from "@/lib/form.types";
import { Tag } from "lucide-react";
import { Label } from "@/components/ui/label";
import { DiffInput } from "@/components/diff/DiffInput";

export const ImageConfigDiff = ({
  base,
  imageState,
  setImageState,
  disabled,
}: {
  base: CommonFormFields;
  imageState: ImageFormFields;
  setImageState: (state: Partial<ImageFormFields>) => void;
  disabled: boolean;
}) => {
  const baseImageState = base.source === "image" ? base.workload.image : null;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2">
        <Label htmlFor="imageTag" className="pb-1 mb-2">
          <Tag className="inline" size={16} /> Image tag
        </Label>
        <span
          className="text-red-500 cursor-default"
          title="This field is required."
        >
          *
        </span>
      </div>
      <div className="flex items-center justify-around gap-8">
        <DiffInput
          disabled={disabled}
          left={baseImageState?.imageTag}
          right={imageState.imageTag}
          setRight={(imageTag) => {
            setImageState({ imageTag });
          }}
          name="imageTag"
          id="imageTag"
          placeholder="nginx:latest"
          required
        />
      </div>
    </div>
  );
};
