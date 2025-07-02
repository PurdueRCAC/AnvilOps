import { HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { cn } from "@/lib/utils";

export default function HelpTooltip({
  children,
  size,
  className,
}: {
  children: React.ReactNode;
  size: number;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <HelpCircle
          tabIndex={0}
          className={cn("inline text-black-4 cursor-help", className)}
          size={size}
        />
      </TooltipTrigger>
      <TooltipContent>{children}</TooltipContent>
    </Tooltip>
  );
}
