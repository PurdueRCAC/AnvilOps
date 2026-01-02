import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { MoveRight } from "lucide-react";

export const DiffInput = ({
  left,
  right,
  setRight,
  leftPlaceholder = "(N/A)",
  disabled = false,
  id,
  ...inputProps
}: Omit<ComponentProps<typeof Input>, "value" | "onChange"> & {
  left: string | undefined;
  right: string | undefined;
  setRight: (value: string) => void;
  leftPlaceholder?: string;
  id?: string;
}) => {
  const isDifferent = (!!left || !!right) && (left ?? "") !== (right ?? "");

  return (
    <div className="grid grid-cols-[1fr_4rem_1fr] w-full gap-4 items-center justify-items-center">
      <Input
        {...inputProps}
        value={left ?? ""}
        placeholder={leftPlaceholder}
        disabled
        required={false}
        className={isDifferent ? "bg-red-50" : ""}
      />
      <MoveRight />
      <Input
        {...inputProps}
        id={id}
        value={right ?? ""}
        onChange={(e) => setRight(e.currentTarget.value)}
        disabled={disabled}
        className={isDifferent ? "bg-green-50" : ""}
      />
    </div>
  );
};
