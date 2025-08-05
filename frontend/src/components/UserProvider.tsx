import type { components } from "@/generated/openapi";
import { api } from "@/lib/api";
import type {
  QueryObserverResult,
  RefetchOptions,
} from "@tanstack/react-query";
import React from "react";
import { useLocation } from "react-router-dom";

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
  error: { code?: number; message?: string } | null;
};

export const UserContext = React.createContext<UserContextType>({
  user: undefined,
  loading: false,
  refetch: undefined,
  error: null,
});

const ALLOWED_UNAUTHENTICATED = ["/", "/error"];

export default function UserProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { pathname } = useLocation();
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
          // Unauthorized
          if (!ALLOWED_UNAUTHENTICATED.includes(pathname)) {
            window.location.href = "/api/login";
          }
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
