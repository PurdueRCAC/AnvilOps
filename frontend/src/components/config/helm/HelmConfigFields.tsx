import { useAppConfig } from "@/components/AppConfigProvider";
import { HelmAccordion } from "@/components/config/helm/HelmAccordion";
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
import { FormContext } from "@/pages/create-app/CreateAppView";
import { ShipWheel } from "lucide-react";
import { useContext, useEffect, useState } from "react";
import { toast } from "sonner";
import { Namespace } from "../Namespace";

const randomString = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID().replace(/-/g, "").slice(0, 16)
    : Math.random().toString(36).slice(2, 18);

const randRange = (min: number, max: number) => {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return 0;
  }
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

export const getDefaultChartValues = (
  valueSpec: HelmValuesBranch,
  path: string[],
  storageClassName?: string,
) => {
  const values: Record<string, any> = {};
  const parentKey = path.join(".");
  for (const [key, spec] of Object.entries(valueSpec.children)) {
    const childKey = parentKey ? parentKey + "." + key : key;
    if (!spec._anvilopsValue) {
      Object.assign(
        values,
        getDefaultChartValues(spec, [...path, key], storageClassName),
      );
    } else if (spec.random) {
      values[childKey] =
        spec.type === "number"
          ? randRange(spec.min ?? 0, spec.max ?? 100)
          : randomString();
    } else if (spec.default) {
      values[childKey] = spec.default;
    } else if (
      key === "storageClassName" ||
      (key === "className" && path.slice(-1)[0] === "storage")
    ) {
      values[childKey] = storageClassName ?? "";
    }
  }
  return values;
};

export type HelmValuesBranch = {
  _anvilopsValue: false;
  _anvilopsRender: {
    type: "section" | "dropdown";
    displayName: string;
  };
  children: {
    [key: string]: HelmValuesBranch | HelmValueMeta;
  };
};

export type HelmValueMeta = {
  _anvilopsValue: true;
  displayName: string;
  type: "text" | "number";
  required: boolean;
  default?: string;
  unit?: string;
  min?: number;
  max?: number;
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

  const { storageClassName } = useAppConfig();
  const context = useContext(FormContext);
  const isExistingApp = context === "UpdateApp" && !!originalConfig;

  const selectedChart = chartsLoading
    ? null
    : charts?.find((chart) => chart.url === url);
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
          onValueChange={(newUrl) => {
            if (newUrl === url) {
              return;
            }

            const chart = charts?.find((c) => c.url === newUrl);
            const values = chart?.valueSpec
              ? getDefaultChartValues(
                  chart.valueSpec as HelmValuesBranch,
                  [],
                  storageClassName,
                )
              : {};
            setState({
              url: newUrl,
              urlType: "oci",
              version: chart?.version,
              watchLabels: chart?.watchLabels,
              values,
            });

            toast.success("Autofilled default values for chart.");
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
                <span className="text-black-3">{chart.url}</span>
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
      {selectedChart && (
        <HelmAccordion
          jsonPath=""
          values={values}
          setState={setState}
          disabled={disabled}
          isExistingApp={isExistingApp}
          valueSpec={selectedChart.valueSpec as HelmValuesBranch}
        />
      )}
    </>
  );
};
