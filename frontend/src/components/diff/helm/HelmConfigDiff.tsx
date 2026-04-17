import { useAppConfig } from "@/components/AppConfigProvider";
import {
  getDefaultChartValues,
  type HelmValueMeta,
  type HelmValuesBranch,
} from "@/components/config/helm/HelmConfigFields";
import { Label } from "@/components/ui/label";
import { SelectContent, SelectItem } from "@/components/ui/select";
import { api } from "@/lib/api";
import type { CommonFormFields, HelmFormFields } from "@/lib/form.types";
import { ShipWheel } from "lucide-react";
import { DiffInput } from "../DiffInput";
import { DiffSelect } from "../DiffSelect";

const getFlattenedValueSpec = (
  jsonPath: string,
  valueSpec: HelmValuesBranch,
): Record<string, HelmValueMeta> => {
  const flattened: Record<string, HelmValueMeta> = {};
  for (const [key, spec] of Object.entries(valueSpec.children)) {
    const childPath = jsonPath ? jsonPath + "." + key : key;
    if (spec._anvilopsValue) {
      flattened[childPath] = spec;
    } else {
      Object.assign(flattened, getFlattenedValueSpec(childPath, spec));
    }
  }
  return flattened;
};

export const HelmConfigDiff = ({
  base,
  helmState,
  setHelmState,
  disabled,
}: {
  base: CommonFormFields;
  helmState: HelmFormFields;
  setHelmState: (state: Partial<HelmFormFields>) => void;
  disabled: boolean;
}) => {
  const { url } = helmState;

  const { data: charts, isPending: chartsLoading } = api.useQuery(
    "get",
    "/templates/charts",
  );
  const selectedChart = !chartsLoading
    ? charts?.find((c) => c.url === url)
    : undefined;
  const flatValueSpec = selectedChart
    ? getFlattenedValueSpec("", selectedChart.valueSpec as HelmValuesBranch)
    : {};
  const baseValues = base.source === "helm" ? base.helm.values : {};
  const values = helmState.values;

  const { storageClassName } = useAppConfig();
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
        <DiffSelect
          left={base.helm.url}
          right={url}
          setRight={(value) => {
            const chart = charts?.find((c) => c.url === value);
            setHelmState({
              url: value,
              urlType: "oci",
              version: chart?.version,
              values: chart
                ? getDefaultChartValues(
                    chart.valueSpec as HelmValuesBranch,
                    [],
                    storageClassName,
                  )
                : {},
              watchLabels: chart?.watchLabels,
            });
          }}
          disabled={disabled}
        >
          <SelectContent>
            {charts?.map((chart) => (
              <SelectItem key={chart.name} value={chart.url}>
                {chart.name}
              </SelectItem>
            ))}
          </SelectContent>
        </DiffSelect>

        <h3 className="mt-4 border-b pb-1 font-bold">Deployment Options</h3>
        {Object.entries(flatValueSpec).map(([jsonPath, spec]) => (
          <div key={jsonPath} className="space-y-2">
            <div className="flex items-baseline gap-2">
              <Label className="pb-1" htmlFor="portNumber">
                {spec.displayName}{" "}
                <span className="text-black-2 text-sm">({jsonPath})</span>
              </Label>
              {spec.required && (
                <span
                  className="cursor-default text-red-500"
                  title="This field is required."
                >
                  *
                </span>
              )}
            </div>
            <DiffInput
              left={baseValues?.[jsonPath]?.toString()}
              right={values?.[jsonPath]?.toString()}
              setRight={(value) => {
                const next = { ...values };
                if (spec.type === "number") {
                  if (value.trim() === "") {
                    delete next[jsonPath];
                  } else {
                    const n = parseFloat(value);
                    if (Number.isFinite(n)) {
                      next[jsonPath] = n;
                    } else {
                      delete next[jsonPath];
                    }
                  }
                } else {
                  next[jsonPath] = value;
                }
                setHelmState({ values: next });
              }}
              type={spec.type}
              unit={spec.unit}
              id={jsonPath}
              name={jsonPath}
              placeholder={spec.default}
              required={spec.required}
              disabled={disabled || spec.noUpdate} // The app already exists, so noUpdate fields cannot be updated
              min={spec.min}
              max={spec.max}
            />
          </div>
        ))}
      </div>
    </>
  );
};
