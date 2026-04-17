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
  const displayValue =
    value === undefined || value === null
      ? ""
      : typeof value === "number" && !Number.isFinite(value)
        ? ""
        : String(value);
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
          value={displayValue}
          onChange={(e) => {
            const raw = e.currentTarget.value;
            const next = { ...values };
            if (valueSpec.type === "number") {
              if (raw.trim() === "") {
                delete next[jsonPath];
              } else {
                const n = parseFloat(raw);
                if (Number.isFinite(n)) {
                  next[jsonPath] = n;
                } else {
                  delete next[jsonPath];
                }
              }
            } else {
              next[jsonPath] = raw;
            }
            setState({ values: next });
          }}
          min={valueSpec.min}
          max={valueSpec.max}
        />
        {valueSpec.unit}
      </div>
    </div>
  );
};
