import type { paths } from "@/generated/openapi";
import { api } from "@/lib/api";
import { createContext, useContext, type ReactNode } from "react";

type AppConfigType =
  paths["/settings"]["get"]["responses"]["200"]["content"]["application/json"];

const AppConfig = createContext<AppConfigType>({});

export const useAppConfig = () => useContext(AppConfig);

export const AppConfigProvider = ({ children }: { children: ReactNode }) => {
  const { data: value } = api.useSuspenseQuery("get", "/settings");

  return (
    <AppConfig.Provider value={value ?? {}}>{children}</AppConfig.Provider>
  );
};
