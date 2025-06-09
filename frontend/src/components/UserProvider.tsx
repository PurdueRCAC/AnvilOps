import type { components } from "@/generated/openapi";
import { api } from "@/lib/api";
import React from "react";

export type User = components["schemas"]["User"];

type UserContextType = {
  user: User | undefined;
  loading: boolean;
};

export const UserContext = React.createContext<UserContextType>({
  user: undefined,
  loading: false,
});

export default function UserProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: user, isPending } = api.useQuery(
    "get",
    "/user/me",
    {},
    {
      retry(failureCount, error) {
        if (error.code === 401) {
          // Unauthorized
          window.location.href = "/api/login";
          return false;
        }
        return failureCount < 3;
      },
    },
  );

  return (
    <UserContext.Provider value={{ user, loading: isPending }}>
      {children}
    </UserContext.Provider>
  );
}
