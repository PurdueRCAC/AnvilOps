/* eslint-disable @typescript-eslint/no-unused-vars */ // TODO

import type { CommonFormFields, HelmFormFields } from "@/lib/form.types";

//@ts-expect-error WIP
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
