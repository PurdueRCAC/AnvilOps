import React, { type Dispatch, type SetStateAction } from "react";
import { type User } from "@/generated/openapi/models/User";
import { type ApiError } from "@/generated/openapi/models/ApiError";
import { UserApi } from "@/generated/openapi/apis/UserApi";
import { toast } from "sonner";
import { ResponseError } from "@/generated/openapi/runtime";

type UserContextType = {
  user: User | null;
  setUser: Dispatch<SetStateAction<User | null>>;
  loading: boolean;
};

export const UserContext = React.createContext<UserContextType>({
  user: null,
  setUser: () => {},
  loading: false,
});

export default function UserProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = React.useState<User | null>(null);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => {
    (async () => {
      try {
        const api = new UserApi();
        setUser(await api.getUser());
      } catch (e) {
        if (e instanceof ResponseError) {
          const response = e.response;
          if (response.status !== 401) {
            const apiErr = (await response.json()) as ApiError;
            toast("User: " + apiErr.message, {
              action: {
                label: "Close",
                onClick: () => {},
              },
            });
          }
        } else {
          toast("User: Something went wrong.", {
            action: {
              label: "Close",
              onClick: () => {},
            },
          });
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <UserContext.Provider value={{ user, setUser, loading }}>
      {children}
    </UserContext.Provider>
  );
}
