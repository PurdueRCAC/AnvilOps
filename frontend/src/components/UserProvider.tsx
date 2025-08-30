import type { components } from "@/generated/openapi";
import { api } from "@/lib/api";
import type {
  QueryObserverResult,
  RefetchOptions,
} from "@tanstack/react-query";
import React from "react";

export type User = components["schemas"]["User"];

type UserContextType = {
  user: User | undefined;
  loading: boolean;
  refetch:
    | ((options: RefetchOptions | undefined) => Promise<
        QueryObserverResult<
          {
            id: number;
            email: string;
            name: string;
            orgs: components["schemas"]["UserOrg"][];
          },
          {
            code: number;
            message: string;
          }
        >
      >)
    | undefined;
  error: { code?: number; message?: string } | undefined | null;
};

export const UserContext = React.createContext<UserContextType>({
  user: undefined,
  loading: false,
  refetch: undefined,
  error: null,
});

export default function UserProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const {
    data: user,
    isPending,
    refetch,
    error,
  } = api.useQuery(
    "get",
    "/user/me",
    {},
    {
      retry(failureCount, error) {
        if (error.code === 401) {
          // Unauthorized - in lib/api.ts, we redirect the user to the login page.
          return false;
        }
        return failureCount < 3;
      },
    },
  );

  return (
    <UserContext.Provider
      value={{
        user,
        loading: isPending,
        refetch,
        error,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}
