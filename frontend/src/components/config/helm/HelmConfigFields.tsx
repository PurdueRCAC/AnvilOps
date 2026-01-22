/* eslint-disable @typescript-eslint/no-unused-vars */ // TODO
import type { HelmFormFields } from "@/lib/form.types";

//@ts-expect-error WIP
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
