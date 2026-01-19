import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Label } from "@/components/ui/label";
import {
  Code2,
  Cog,
  Cpu,
  MemoryStick,
  Scale3D,
  Server,
  Terminal,
} from "lucide-react";
import { DiffInput } from "../DiffInput";
import type {
  CommonFormFields,
  WorkloadFormFields,
  WorkloadUpdate,
} from "@/lib/form.types";
import { EnvsWithDiffs } from "@/components/diff/workload/EnvsWithDiffs";
import { SelectContent, SelectGroup, SelectItem } from "@/components/ui/select";
import { useAppConfig } from "@/components/AppConfigProvider";
import { SubdomainDiff } from "./SubdomainDiff";
import { DiffSelect } from "../DiffSelect";

export const CommonWorkloadConfigDiff = ({
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
  const appConfig = useAppConfig();
  const baseWorkloadState = base.appType === "workload" ? base.workload : null;

  const fixedSensitiveNames = new Set(
    baseWorkloadState?.env
      .filter((env) => env.isSensitive)
      .map((env) => env.name) ?? [],
  );

  return (
    <>
      <h3 className="mt-4 border-b pb-1 font-bold">Deployment Options</h3>
      {appConfig.appDomain && (
        <SubdomainDiff
          base={base}
          workloadState={workloadState}
          setWorkloadState={setWorkloadState}
          disabled={disabled}
        />
      )}
      <div className="space-y-2">
        <div className="flex items-baseline gap-2">
          <Label className="pb-1" htmlFor="portNumber">
            <Server className="inline" size={16} /> Port Number
          </Label>
          <span
            className="cursor-default text-red-500"
            title="This field is required."
          >
            *
          </span>
        </div>
        <div className="flex items-center justify-around gap-8">
          <DiffInput
            disabled={disabled}
            name="portNumber"
            id="portNumber"
            placeholder="3000"
            type="number"
            required
            min="1"
            max="65536"
            left={baseWorkloadState?.port}
            right={workloadState.port}
            setRight={(port) => {
              setWorkloadState({ port });
            }}
          />
        </div>
      </div>
      <div className="space-y-2">
        <div className="mb-2 flex items-baseline gap-2">
          <Label className="pb-1" htmlFor="replicas">
            <Scale3D className="inline" size={16} /> Replicas
          </Label>
          <span
            className="cursor-default text-red-500"
            title="This field is required."
          >
            *
          </span>
        </div>
        <div className="flex items-center gap-8">
          <DiffInput
            disabled={disabled}
            id="replicas"
            name="replicas"
            type="number"
            required
            left={baseWorkloadState?.replicas}
            right={workloadState.replicas}
            setRight={(replicas) => {
              setWorkloadState({ replicas });
            }}
          />
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex items-baseline gap-2">
          <Label className="pb-1" htmlFor="cpuCores">
            <Cpu className="inline" size={16} /> CPU Cores
          </Label>
          <span
            className="cursor-default text-red-500"
            title="This field is required."
          >
            *
          </span>
        </div>
        <div className="flex items-center justify-around gap-8">
          <DiffInput
            name="cpuCores"
            id="cpuCores"
            placeholder="0.5"
            type="number"
            required
            step=".001"
            min="0"
            left={baseWorkloadState?.cpuCores}
            right={workloadState.cpuCores ?? "1"}
            setRight={(cpuCores) => {
              setWorkloadState({ cpuCores });
            }}
          />
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex items-baseline gap-2">
          <Label className="pb-1" htmlFor="memoryInMiB">
            <MemoryStick className="inline" size={16} /> Memory (MiB)
          </Label>
          <span
            className="cursor-default text-red-500"
            title="This field is required."
          >
            *
          </span>
        </div>
        <div className="flex items-center justify-around gap-8">
          <DiffInput
            name="memoryInMiB"
            id="memoryInMiB"
            placeholder="1024"
            type="number"
            required
            min="1"
            left={baseWorkloadState?.memoryInMiB}
            right={workloadState.memoryInMiB ?? "1024"}
            setRight={(memoryInMiB) => {
              setWorkloadState({ memoryInMiB });
            }}
          />
        </div>
      </div>
      <Accordion type="single" collapsible>
        <AccordionItem value="env">
          <AccordionTrigger>
            <Label className="pb-1">
              <Code2 className="inline" size={16} /> Environment Variables
            </Label>
          </AccordionTrigger>
          <AccordionContent className="px-4">
            <EnvsWithDiffs
              disabled={disabled}
              base={baseWorkloadState?.env ?? []}
              value={workloadState.env}
              setValue={(updater) =>
                setWorkloadState((prev) => ({
                  ...prev,
                  env: updater(prev.env),
                }))
              }
              fixedSensitiveNames={fixedSensitiveNames}
            />
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="advanced">
          <AccordionTrigger>
            <Label className="pb-1">
              <Cog className="inline" size={16} /> Advanced
            </Label>
          </AccordionTrigger>
          <AccordionContent className="space-y-10 px-4">
            <div className="space-y-2">
              <div>
                <Label className="pb-1" htmlFor="collectLogs">
                  <Terminal className="inline" size={16} /> Keep Historical Logs
                </Label>
                <p className="text-black-2 text-sm">
                  When this setting is disabled, you will only be able to view
                  logs from the most recent, alive pod from your app's most
                  recent deployment.
                </p>
              </div>
              <div className="flex items-center justify-around gap-8">
                <DiffSelect
                  required
                  disabled={disabled}
                  name="collectLogs"
                  left={
                    baseWorkloadState
                      ? baseWorkloadState.collectLogs?.toString()
                      : undefined
                  }
                  right={workloadState.collectLogs.toString()}
                  setRight={(collectLogs) => {
                    setWorkloadState({ collectLogs: collectLogs === "true" });
                  }}
                  defaultValue="true"
                >
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="true">Enabled</SelectItem>
                      <SelectItem value="false">Disabled</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </DiffSelect>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </>
  );
};
