import type { HelmValueMeta } from "@/components/config/helm/HelmConfigFields";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Label } from "@/components/ui/label";
import { SelectContent, SelectItem } from "@/components/ui/select";
import { api } from "@/lib/api";
import type { CommonFormFields, HelmFormFields } from "@/lib/form.types";
import { capitalizeAndJoin } from "@/lib/utils";
import { ShipWheel } from "lucide-react";
import { DiffInput } from "../DiffInput";
import { DiffSelect } from "../DiffSelect";
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

  const { data: charts } = api.useQuery("get", "/templates/charts");

  const selectedChart = charts?.find((c) => c.url === helmState.url);
  const valueTypes = selectedChart ? Object.keys(selectedChart.valueSpec) : [];

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
              values: {},
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
                    {(
                      selectedChart.valueSpec[valueType] as HelmValueMeta[]
                    ).map((value: HelmValueMeta) => (
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
                          <DiffInput
                            disabled={disabled || value.noUpdate}
                            name={value.name}
                            id={value.name}
                            placeholder={value.default}
                            className="w-full"
                            type={value.type}
                            required={value.required}
                            left={
                              (
                                base.helm.values?.[valueType] as Record<
                                  string,
                                  string
                                >
                              )?.[value.name] ?? ""
                            }
                            right={
                              (
                                helmState.values?.[valueType] as Record<
                                  string,
                                  string
                                >
                              )?.[value.name] ?? ""
                            }
                            setRight={(result) =>
                              setHelmState({
                                values: {
                                  ...helmState.values,
                                  [valueType]: {
                                    ...(helmState.values?.[valueType] ?? {}),
                                    [value.name]: result,
                                  },
                                },
                              })
                            }
                          />
                          {value.unit}
                        </div>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
        </Accordion>
      </div>
    </>
  );
};
