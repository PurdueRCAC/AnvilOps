import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { components } from "@/generated/openapi";
import { api } from "@/lib/api";
import { generateNamespace } from "@/lib/form";
import type { CommonFormFields, HelmFormFields } from "@/lib/form.types";
import { capitalizeAndJoin } from "@/lib/utils";
import { FormContext } from "@/pages/create-app/CreateAppView";
import { ShipWheel } from "lucide-react";
import { useContext, useEffect, useState } from "react";
import { toast } from "sonner";
import { Namespace } from "../Namespace";

const randomString = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID().replace(/-/g, "").slice(0, 16)
    : Math.random().toString(36).slice(2, 18);

export type HelmValueMeta = {
  name: string;
  displayName: string;
  type?: string;
  required?: boolean;
  default?: string;
  unit?: string;
  random?: boolean;
  noUpdate: boolean;
};

export const HelmConfigFields = ({
  appState,
  setAppState,
  setState,
  disabled,
  originalConfig,
}: {
  appState: CommonFormFields;
  setAppState: (update: Partial<CommonFormFields>) => void;
  setState: (update: Partial<HelmFormFields>) => void;
  disabled?: boolean;
  originalConfig?: components["schemas"]["DeploymentConfig"];
}) => {
  const { data: charts, isPending: chartsLoading } = api.useQuery(
    "get",
    "/templates/charts",
  );
  const { helm: state } = appState;
  const { url, values } = state;

  const context = useContext(FormContext);
  const isExistingApp = context === "UpdateApp" && !!originalConfig;

  const selectedChart = chartsLoading
    ? null
    : charts?.find((chart) => chart.url === url);
  const valueTypes = selectedChart ? Object.keys(selectedChart.valueSpec) : [];

  useEffect(() => {
    const valueSpec = selectedChart?.valueSpec;
    if (!isExistingApp && valueSpec) {
      let hasRandom = false;
      const values: Record<string, Record<string, string>> = {};
      for (const valueType of Object.keys(valueSpec)) {
        values[valueType] = {};
        for (const value of valueSpec[valueType] as HelmValueMeta[]) {
          if (value.random) {
            values[valueType][value.name] = randomString();
            hasRandom = true;
          }
        }
      }
      if (hasRandom) {
        setState({ values });
        toast.success("Autofilled random values for chart.");
      }
    }
  }, [selectedChart]);

  const [hasChangedNamespace, setHasChangedNamespace] = useState(false);

  useEffect(() => {
    if (!hasChangedNamespace) {
      setAppState({ namespace: generateNamespace(appState) });
    }
  }, [state.url]);
  return (
    <>
      <div className="space-y-2">
        <div className="flex items-baseline gap-2">
          <Label htmlFor="selectChart" className="pb-1">
            <ShipWheel className="inline" size={16} />
            Helm Chart
          </Label>
          <span
            className="cursor-default text-red-500"
            title="This field is required."
          >
            *
          </span>
        </div>
        <Select
          required
          name="chart"
          value={url ?? ""}
          onValueChange={(value) => {
            const chart = charts?.find((c) => c.url === value);
            setState({
              url: value,
              urlType: "oci",
              version: chart?.version,
              values: {},
            });
          }}
          disabled={disabled}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a chart" />
          </SelectTrigger>
          <SelectContent>
            {charts?.map((chart) => (
              <SelectItem key={chart.name} value={chart.url}>
                {chart.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedChart && selectedChart.note && (
          <div className="mt-2 text-sm text-gray-500">
            <p className="whitespace-pre-line">{selectedChart.note}</p>
          </div>
        )}
      </div>
      <h3 className="mt-4 border-b pb-1 font-bold">Deployment Options</h3>
      {!isExistingApp && (
        <Namespace
          state={appState}
          setState={setAppState}
          setHasChangedNamespace={setHasChangedNamespace}
        />
      )}
      <Accordion type="single" collapsible>
        {selectedChart &&
          valueTypes.map((valueType) => (
            <AccordionItem key={valueType} value={valueType}>
              <AccordionTrigger>
                <Label className="pb-1">
                  {capitalizeAndJoin(valueType.split("_"))}
                </Label>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2">
                  {(selectedChart.valueSpec[valueType] as HelmValueMeta[]).map(
                    (value: HelmValueMeta) => (
                      <div key={value.name} className="space-y-2">
                        <div className="flex items-baseline gap-2">
                          <Label className="pb-1" htmlFor={value.name}>
                            {value.displayName}
                          </Label>
                          {value.required && (
                            <span
                              className="cursor-default text-red-500"
                              title="This field is required."
                            >
                              *
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            disabled={
                              disabled || (value.noUpdate && isExistingApp)
                            }
                            name={value.name}
                            id={value.name}
                            placeholder={value.default}
                            className="w-full"
                            type={value.type}
                            required={value.required}
                            value={
                              (values?.[valueType] as Record<string, string>)?.[
                                value.name
                              ] ?? ""
                            }
                            onChange={(e) =>
                              setState({
                                values: {
                                  ...values,
                                  [valueType]: {
                                    ...(values?.[valueType] ?? {}),
                                    [value.name]: e.currentTarget.value,
                                  },
                                },
                              })
                            }
                          />
                          {value.unit}
                        </div>
                      </div>
                    ),
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
      </Accordion>
    </>
  );
};
