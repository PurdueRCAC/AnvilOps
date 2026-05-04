import { Input } from "@/components/ui/input";
import { MoveRight } from "lucide-react";
import type { ComponentProps } from "react";

export const DiffInput = ({
  left,
  right,
  setRight,
  leftPlaceholder = "(N/A)",
  disabled = false,
  id,
  unit,
  ...inputProps
}: Omit<ComponentProps<typeof Input>, "value" | "onChange"> & {
  left: string | undefined;
  right: string | undefined;
  setRight: (value: string) => void;
  leftPlaceholder?: string;
  id?: string;
  unit?: string;
}) => {
  const isDifferent = (!!left || !!right) && (left ?? "") !== (right ?? "");

  return (
    <div className="grid w-full grid-cols-[1fr_4rem_1fr] place-items-center gap-4">
      <div className="flex w-full items-center gap-2">
        <Input
          {...inputProps}
          value={left ?? ""}
          placeholder={leftPlaceholder}
          disabled
          required={false}
          className={isDifferent ? "bg-red-50" : ""}
        />
        {unit}
      </div>
      <MoveRight />
      <div className="flex w-full items-center gap-2">
        <Input
          {...inputProps}
          id={id}
          value={right ?? ""}
          onChange={(e) => setRight(e.currentTarget.value)}
          disabled={disabled}
          className={isDifferent ? "bg-green-50" : ""}
        />
        {unit}
      </div>
    </div>
  );
};
