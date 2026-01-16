import type { HelmFormFields } from "@/lib/form.types";

//@ts-ignore
export const HelmConfigFields = ({
  state,
  setState,
  disabled,
}: {
  state: HelmFormFields;
  setState: (update: HelmFormFields) => void;
  disabled?: boolean;
}) => {
  return <div className="space-y-2"></div>;
};
