import { api } from "@/lib/api";
import { createDefaultCommonFormFields, generateNamespace } from "@/lib/form";
import type { CommonFormFields } from "@/lib/form.types";
import { ArrowRight, ShipWheel } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAppConfig } from "../AppConfigProvider";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Label } from "../ui/label";
import {
  getDefaultChartValues,
  type HelmValuesBranch,
} from "./helm/HelmConfigFields";

export const TemplateConfig = ({
  state,
  selected,
  setSelected,
}: {
  state: CommonFormFields;
  selected: Set<string>;
  setSelected: (setter: (selected: Set<string>) => Set<string>) => void;
}) => {
  const { data: charts, isLoading } = api.useQuery("get", "/templates/charts");
  const navigate = useNavigate();
  const { storageClassName } = useAppConfig();
  const exportToGroupStates = () => {
    const states = [state];
    if (!isLoading && charts) {
      const defaultState = createDefaultCommonFormFields();
      for (const chart of charts) {
        if (selected.has(chart.url)) {
          const templateState: CommonFormFields = {
            ...defaultState,
            projectId: state.projectId,
            appType: "helm",
            source: "helm",
            helm: {
              url: chart.url,
              urlType: chart.urlType as "absolute" | "oci",
              version: chart.version,
              watchLabels: chart.watchLabels,
              values: getDefaultChartValues(
                chart.valueSpec as HelmValuesBranch,
                [],
                storageClassName,
              ),
            },
          };
          templateState.namespace = generateNamespace(templateState);
          states.push(templateState);
        }
      }
    }
    sessionStorage.setItem("appStates", JSON.stringify(states));
  };

  return (
    <div className="space-y-2">
      <Label className="pb-1">
        <ShipWheel className="inline" size={16} />
        Add-Ons
      </Label>
      <div className="max-h-52 w-full overflow-y-auto" tabIndex={-1}>
        <div className="grid gap-3 pr-1">
          {!isLoading &&
            charts?.map((chart, index) => {
              const fieldId = `template-chart-${chart.url}-${index}`;
              return (
                <Label
                  key={fieldId}
                  htmlFor={fieldId}
                  className="border-input focus-within:border-ring focus-within:ring-ring/50 flex w-full cursor-pointer items-center gap-2 rounded-lg border p-4 transition-colors outline-none focus-within:ring-[3px] hover:bg-gray-50 has-checked:bg-gray-50"
                >
                  <Checkbox
                    id={fieldId}
                    tabIndex={-1}
                    checked={selected.has(chart.url)}
                    onCheckedChange={(checked) => {
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (checked === true) {
                          next.add(chart.url);
                        } else {
                          next.delete(chart.url);
                        }
                        return next;
                      });
                    }}
                  />
                  {chart.name}
                  <p className="max-w-96 truncate font-normal opacity-50">
                    {chart.description}
                  </p>
                </Label>
              );
            })}
        </div>
      </div>

      {selected.size > 0 && (
        <Button
          type="button"
          className="w-full"
          onClick={() => {
            exportToGroupStates();
            navigate("/create-group");
          }}
        >
          Configure Add-Ons
          <ArrowRight />
        </Button>
      )}
    </div>
  );
};
