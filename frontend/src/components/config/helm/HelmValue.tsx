import type { HelmValueMeta } from "@/components/config/helm/HelmConfigFields";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { HelmFormFields } from "@/lib/form.types";

export const HelmValue = ({
  jsonPath,
  valueSpec,
  values,
  setState,
  disabled,
  isExistingApp,
}: {
  jsonPath: string;
  valueSpec: HelmValueMeta;
  values?: HelmFormFields["values"];
  setState: (update: Partial<HelmFormFields>) => void;
  disabled?: boolean;
  isExistingApp?: boolean;
}) => {
  const value = values?.[jsonPath];
  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2">
        <Label className="pb-1" htmlFor={jsonPath}>
          {valueSpec.displayName}{" "}
          <span className="text-black-2 text-sm">({jsonPath})</span>
        </Label>
        {valueSpec.required && (
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
          disabled={disabled || (valueSpec.noUpdate && isExistingApp)}
          name={jsonPath}
          id={jsonPath}
          placeholder={valueSpec.default}
          className="w-full"
          type={valueSpec.type}
          required={valueSpec.required}
          value={value ? value.toString() : ""}
          onChange={(e) => {
            const val =
              valueSpec.type === "number"
                ? parseFloat(e.currentTarget.value)
                : e.currentTarget.value;
            setState({
              values: {
                ...values,
                [jsonPath]: val,
              },
            });
          }}
          min={valueSpec.min}
          max={valueSpec.max}
        />
        {valueSpec.unit}
      </div>
    </div>
  );
};
