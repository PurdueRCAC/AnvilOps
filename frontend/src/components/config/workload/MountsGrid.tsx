import { TooltipTrigger } from "@radix-ui/react-tooltip";
import { Trash2 } from "lucide-react";
import { Fragment, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent } from "@/components/ui/tooltip";

export type Mounts = { path: string; amountInMiB: number }[];

export const MountsGrid = ({
  readonly = false,
  value: mounts,
  setValue: setMounts,
}: {
  readonly?: boolean;
  value: Mounts;
  setValue: (updater: (mounts: Mounts) => Mounts) => void;
}) => {
  useEffect(() => {
    for (let i in mounts) {
      if (mounts[i].path === "" && +i < mounts.length - 1) {
        setMounts((prev) => prev.toSpliced(+i, 1));
        return;
      }
    }
    if (mounts[mounts.length - 1]?.path !== "") {
      setMounts((prev) => [...prev, { path: "", amountInMiB: 1024 }]);
    }
  }, [mounts]);

  return (
    <div className="grid grid-cols-[3fr_min-content_1fr_min-content_min-content] items-center gap-2">
      <span className="text-sm col-span-2">Path</span>
      <span className="text-sm col-span-3">Amount</span>
      {mounts.map(({ path, amountInMiB }, index) => (
        <Fragment key={index}>
          <Input
            disabled={readonly}
            placeholder="/mnt/persistent/storage"
            required={index !== mounts.length - 1}
            className="w-full"
            value={path}
            onChange={(e) => {
              const value = e.currentTarget.value;
              setMounts((prev) =>
                prev.toSpliced(index, 1, {
                  ...prev[index],
                  path: value,
                }),
              );
            }}
          />
          <span className="text-xl align-middle">:</span>
          <Input
            disabled={readonly}
            placeholder="production"
            className="w-full"
            value={amountInMiB}
            type="number"
            min="1"
            max="10240"
            onChange={(e) => {
              const value = e.currentTarget.valueAsNumber;
              setMounts((prev) =>
                prev.toSpliced(index, 1, {
                  ...prev[index],
                  amountInMiB: value,
                }),
              );
            }}
          />
          <Tooltip>
            <TooltipTrigger>
              <span className="align-middle mx-2">MiB</span>
            </TooltipTrigger>
            <TooltipContent>Mebibytes; 1 MiB = 1,048,576 bytes</TooltipContent>
          </Tooltip>
          <Button
            disabled={readonly}
            variant="secondary"
            type="button"
            onClick={() => {
              setMounts((mounts) => mounts.toSpliced(index, 1));
            }}
          >
            <Trash2 />
          </Button>
        </Fragment>
      ))}
    </div>
  );
};
