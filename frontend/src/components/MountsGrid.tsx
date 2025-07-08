import { TooltipTrigger } from "@radix-ui/react-tooltip";
import { Trash2 } from "lucide-react";
import { Fragment, useEffect, type Dispatch } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Tooltip, TooltipContent } from "./ui/tooltip";

export type Mounts = { path: string; amountInMiB: number }[];

export const MountsGrid = ({
  value: mounts,
  setValue: setMounts,
}: {
  value: Mounts;
  setValue: Dispatch<React.SetStateAction<Mounts>>;
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
            placeholder="/mnt/persistent/storage"
            required={index !== mounts.length - 1}
            className="w-full"
            value={path}
            onChange={(e) => {
              const newList = structuredClone(mounts);
              newList[index].path = e.currentTarget.value;
              setMounts(newList);
            }}
          />
          <span className="text-xl align-middle">:</span>
          <Input
            placeholder="production"
            className="w-full"
            value={amountInMiB}
            type="number"
            min="1"
            max="10240"
            onChange={(e) => {
              const newList = structuredClone(mounts);
              newList[index].amountInMiB = e.currentTarget.valueAsNumber;
              setMounts(newList);
            }}
          />
          <Tooltip>
            <TooltipTrigger>
              <span className="align-middle mx-2">MiB</span>
            </TooltipTrigger>
            <TooltipContent>Mebibytes; 1 MiB = 1,048,576 bytes</TooltipContent>
          </Tooltip>
          <Button
            variant="secondary"
            type="button"
            onClick={() => {
              setMounts(mounts.filter((_, i) => i !== index));
            }}
          >
            <Trash2 />
          </Button>
        </Fragment>
      ))}
    </div>
  );
};
