import type { CommonFormFields, HelmFormFields } from "@/lib/form.types";

//@ts-ignore
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
  return <div className="space-y-2"></div>;
};
