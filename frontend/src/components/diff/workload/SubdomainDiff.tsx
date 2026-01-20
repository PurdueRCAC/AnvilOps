import { useAppConfig } from "@/components/AppConfigProvider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectContent, SelectGroup, SelectItem } from "@/components/ui/select";
import { api } from "@/lib/api";
import { MAX_SUBDOMAIN_LENGTH } from "@/lib/form";
import type {
  CommonFormFields,
  WorkloadFormFields,
  WorkloadUpdate,
} from "@/lib/form.types";
import { cn, useDebouncedValue } from "@/lib/utils";
import { NameStatus } from "@/pages/create-app/CreateAppView";
import { Link, Loader, MoveRight, X } from "lucide-react";
import type { ComponentProps } from "react";
import { DiffSelect } from "../DiffSelect";

export const SubdomainDiff = ({
  base,
  workloadState,
  setWorkloadState,
  disabled,
}: {
  base: CommonFormFields;
  workloadState: WorkloadFormFields;
  setWorkloadState: (update: WorkloadUpdate) => void;
  disabled: boolean;
}) => {
  const baseWorkloadState = base.appType === "workload" ? base.workload : null;

  const { createIngress, subdomain } = workloadState;
  return (
    <>
      <DiffSelect
        required
        left={baseWorkloadState?.createIngress.toString()}
        right={createIngress.toString()}
        setRight={(createIngress) => {
          setWorkloadState({ createIngress: createIngress === "true" });
        }}
        name="createIngress"
        id="createIngress"
      >
        <SelectContent>
          <SelectGroup>
            <SelectItem value="true">Expose app</SelectItem>
            <SelectItem value="false">Do not expose app</SelectItem>
          </SelectGroup>
        </SelectContent>
      </DiffSelect>
      <div className="space-y-2">
        <div className="flex items-baseline gap-2">
          <Label className="pb-1" htmlFor="subdomain">
            <Link className="inline" size={16} /> Public URL
          </Label>
          {createIngress && (
            <span
              className="text-red-500 h-fit cursor-default"
              title="This field is required."
            >
              *
            </span>
          )}
        </div>
      </div>
      <SubdomainDiffInput
        id="subdomain"
        disabled={disabled || !createIngress}
        required={createIngress}
        left={baseWorkloadState?.subdomain ?? undefined}
        right={subdomain ?? ""}
        setRight={(subdomain) => {
          subdomain = subdomain.toLowerCase().replace(/[^a-z0-9-]/, "-");
          setWorkloadState({ subdomain });
        }}
        placeholder="my-app"
        pattern="[A-Za-z0-9](?:[A-Za-z0-9\-]{0,61}[A-Za-z0-9])?"
        autoComplete="off"
      />
    </>
  );
};

const SubdomainDiffInput = ({
  left,
  right,
  setRight,
  required,
  disabled,
  leftPlaceholder = "(N/A)",
  id,
  ...inputProps
}: ComponentProps<typeof Input> & {
  left: string | undefined;
  right: string | undefined;
  setRight: (value: string) => void;
  leftPlaceholder?: string;
  id: string;
}) => {
  const appConfig = useAppConfig();
  const appDomain = URL.parse(appConfig?.appDomain ?? "");
  const showSubdomainError =
    !!right &&
    right !== left &&
    (right.length > MAX_SUBDOMAIN_LENGTH ||
      right.match(/^[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?$/) === null);

  const debouncedSub = useDebouncedValue(right);
  const enableSubdomainCheck =
    !!right && right === debouncedSub && right !== left && !showSubdomainError;

  const { data: subStatus, isPending: subLoading } = api.useQuery(
    "get",
    "/app/subdomain",
    {
      params: {
        query: {
          subdomain: debouncedSub ?? "",
        },
      },
    },
    { enabled: enableSubdomainCheck },
  );

  const isDifferent = (!!left || !!right) && (left ?? "") !== (right ?? "");
  return (
    <div className="grid grid-cols-[1fr_4rem_1fr] w-full gap-4 items-center justify-items-center">
      {left ? (
        <div className="flex relative items-center gap-2">
          <span className="absolute left-2 text-sm opacity-50">
            {appDomain?.protocol}//
          </span>
          <Input
            {...inputProps}
            value={left ?? ""}
            placeholder={leftPlaceholder}
            disabled
            required={false}
            className={cn("w-full pl-14 pr-45", isDifferent && "bg-red-50")}
          />
          <span className="absolute right-2 text-sm opacity-50">
            .{appDomain?.host}
          </span>
        </div>
      ) : (
        <Input
          {...inputProps}
          placeholder={leftPlaceholder}
          disabled
          required={false}
          className={cn("w-full pl-14 pr-45", isDifferent && "bg-red-50")}
        />
      )}
      <MoveRight />
      <div className="flex relative items-center gap-2 w-full">
        <span className="absolute left-2 text-sm opacity-50">
          {appDomain?.protocol}//
        </span>
        <Input
          {...inputProps}
          value={!disabled ? (right ?? "") : "(N/A)"}
          disabled={disabled}
          required={required}
          className={cn("w-full pl-14 pr-45", isDifferent && "bg-green-50")}
          onChange={(e) => {
            const subdomain = e.currentTarget.value
              .toLowerCase()
              .replace(/[^a-z0-9-]/, "-");
            setRight(subdomain);
          }}
        />
        <span className="absolute right-2 text-sm opacity-50">
          .{appDomain?.host}
        </span>
      </div>
      <div className="col-start-3 text-left">
        {showSubdomainError && (
          <div className="text-sm flex gap-5">
            <X className="text-red-500" />
            <ul className="text-black-3 list-disc">
              <li>A subdomain must have 54 or fewer characters.</li>
              <li>
                A subdomain must only contain lowercase alphanumeric characters
                or dashes(-).
              </li>
              <li>
                A subdomain must start and end with an alphanumeric character.
              </li>
            </ul>
          </div>
        )}
        {right &&
          !showSubdomainError &&
          right !== left &&
          (right !== debouncedSub || subLoading ? (
            <span className="text-sm">
              <Loader className="animate-spin inline" /> Checking subdomain...
            </span>
          ) : (
            <NameStatus
              available={subStatus!.available}
              resourceName="Subdomain"
            />
          ))}
      </div>
    </div>
  );
};
