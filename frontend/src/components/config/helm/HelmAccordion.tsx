import type { HelmValuesBranch } from "@/components/config/helm/HelmConfigFields";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Label } from "@/components/ui/label";
import type { HelmFormFields } from "@/lib/form.types";
import { HelmValue } from "./HelmValue";

export const HelmAccordion = ({
  jsonPath,
  values,
  setState,
  disabled,
  isExistingApp,
  valueSpec,
}: {
  jsonPath: string;
  valueSpec: HelmValuesBranch;
  values?: HelmFormFields["values"];
  setState: (update: Partial<HelmFormFields>) => void;
  disabled?: boolean;
  isExistingApp?: boolean;
}) => {
  if (valueSpec._anvilopsRender.type === "dropdown") {
    return (
      <Accordion key={jsonPath} type="single" collapsible>
        {Object.entries(valueSpec.children).map(([key, spec]) => {
          const childJsonPath = jsonPath ? jsonPath + "." + key : key;
          return spec._anvilopsValue ? (
            <HelmValue
              jsonPath={childJsonPath}
              valueSpec={spec}
              values={values}
              setState={setState}
              disabled={disabled}
              isExistingApp={isExistingApp}
            />
          ) : (
            <HelmAccordion
              jsonPath={childJsonPath}
              values={values}
              setState={setState}
              disabled={disabled}
              isExistingApp={isExistingApp}
              valueSpec={spec}
            />
          );
        })}
      </Accordion>
    );
  } else {
    return (
      <AccordionItem
        key={jsonPath}
        value={valueSpec._anvilopsRender.displayName}
      >
        <AccordionTrigger>
          <Label className="pb-1">
            {valueSpec._anvilopsRender.displayName}
          </Label>
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-4">
            {Object.entries(valueSpec.children).map(([key, spec]) => {
              const childJsonPath = jsonPath ? jsonPath + "." + key : key;
              return spec._anvilopsValue ? (
                <HelmValue
                  jsonPath={childJsonPath}
                  valueSpec={spec}
                  values={values}
                  setState={setState}
                  disabled={disabled}
                  isExistingApp={isExistingApp}
                />
              ) : (
                <HelmAccordion
                  jsonPath={childJsonPath}
                  values={values}
                  setState={setState}
                  disabled={disabled}
                  isExistingApp={isExistingApp}
                  valueSpec={spec}
                />
              );
            })}
          </div>
        </AccordionContent>
      </AccordionItem>
    );
  }
};
