import type { ComponentProps } from "react";
import {
  Select,
  SelectContent,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { MoveRight } from "lucide-react";

export const DiffSelect = ({
  left,
  right,
  setRight,
  leftPlaceholder = "(N/A)",
  rightPlaceholder,
  children: selectContent,
  leftContent,
  id,
  ...props
}: ComponentProps<typeof Select> & {
  left?: string;
  right?: string;
  setRight: (value: string) => void;
  leftPlaceholder?: string;
  rightPlaceholder?: string;
  children: React.ReactElement<ComponentProps<typeof SelectContent>>;
  leftContent?: React.ReactElement<ComponentProps<typeof SelectContent>>;
  id?: string;
}) => {
  const isDifferent = (!!left || !!right) && (left ?? "") !== (right ?? "");
  return (
    <div className="grid w-full grid-cols-[1fr_4rem_1fr] place-items-center gap-4 *:w-full">
      <Select value={left} disabled>
        <SelectTrigger className={isDifferent ? `bg-red-50` : ""}>
          <SelectValue placeholder={leftPlaceholder} />
        </SelectTrigger>
        {leftContent ?? selectContent}
      </Select>
      <MoveRight />
      <Select value={right} onValueChange={setRight} {...props}>
        <SelectTrigger id={id} className={isDifferent ? `bg-green-50` : ""}>
          <SelectValue placeholder={rightPlaceholder} />
        </SelectTrigger>
        {selectContent}
      </Select>
    </div>
  );
};
