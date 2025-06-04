import React, { type Dispatch, type SetStateAction } from "react";
import { type User } from '@/generated/openapi/models/User'
import { UserApi } from "@/generated/openapi/apis/UserApi";
import { toast } from "sonner";

type UserContextType = {
    user: User | null,
    setUser: Dispatch<SetStateAction<User | null>>
};

export const UserContext = React.createContext<UserContextType>({
    user: null,
    setUser: () => {}
});

export default function UserProvider({ children } : { children: React.ReactNode }) {
    const [user, setUser] = React.useState<User | null>(null);

    React.useEffect(() => {
        (async () => {
            try {
                const api = new UserApi();
                setUser(await api.getUser());
            } catch (e) {
                toast("User: " + (e as Error).message, {
                    action: {
                        label: 'Close',
                        onClick: () => {},
                    }
                })
            }
        })();
    }, []);

    return <UserContext.Provider value={{ user, setUser }}>
        {children}
    </UserContext.Provider>
}