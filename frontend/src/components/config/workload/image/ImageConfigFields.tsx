import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ImageFormFields } from "@/lib/form.types";
import { Tag } from "lucide-react";

export const ImageConfigFields = ({
  imageState,
  setImageState,
  disabled,
}: {
  imageState: ImageFormFields;
  setImageState: (update: Partial<ImageFormFields>) => void;
  disabled?: boolean;
}) => {
  const { imageTag } = imageState;
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
      <Input
        required
        disabled={disabled}
        value={imageTag ?? ""}
        onChange={(e) => {
          setImageState({ imageTag: e.currentTarget.value });
        }}
        name="imageTag"
        id="imageTag"
        placeholder="nginx:latest"
        className="w-full"
      />
    </div>
  );
};
