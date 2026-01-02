import {
  memo,
  type ComponentProps,
  type ComponentType,
  type DetailedHTMLProps,
  type Dispatch,
  type InputHTMLAttributes,
} from "react";
import type * as SelectPrimitive from "@radix-ui/react-select";
import { Input } from "@/components/ui/input";
import { MoveRight } from "lucide-react";
import { cn } from "@/lib/utils";

export const DiffInput = ({
  left,
  right,
  setRight,
  select,
  leftPlaceholder = "(None)",
  ...props
}: Omit<
  DetailedHTMLProps<InputHTMLAttributes<HTMLInputElement>, HTMLInputElement>,
  "value" | "onChange"
> & {
  left: string | undefined;
  right: string | undefined;
  setRight: Dispatch<string>;
  select?: ComponentType<
    { side?: "before" | "after"; placeholder?: string } & Pick<
      ComponentProps<typeof SelectPrimitive.Root>,
      "value" | "onValueChange"
    >
  >;
  leftPlaceholder?: string;
}) => {
  const Component = select ? memo(select) : Input;
  const isDifferent = (!!left || !!right) && (left ?? "") !== (right ?? "");

  return (
    <div className="grid grid-cols-[1fr_4rem_1fr] w-full gap-4 items-center justify-items-center *:w-full">
      <Component
        {...(select !== undefined ? { side: "before" } : {})}
        value={left}
        placeholder={leftPlaceholder}
        disabled
        className={isDifferent ? "bg-red-50" : ""}
      />
      <MoveRight />
      <Component
        {...props}
        value={right}
        onChange={(e) => setRight(e.currentTarget.value)}
        {...(select !== undefined
          ? { side: "after", onValueChange: (e: string) => setRight(e) }
          : {})}
        className={cn(props.className, isDifferent && "bg-green-50")}
      />
    </div>
  );
};
