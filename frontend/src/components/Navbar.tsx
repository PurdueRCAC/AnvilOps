import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import defaultPfp from "../assets/default_pfp.png";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@radix-ui/react-dropdown-menu";
import { DropdownMenuTrigger } from "./ui/dropdown-menu";
import { Button } from "./ui/button";
import { UserContext } from "./UserProvider";
import React from "react";
import { OrgApi, UserApi } from "@/generated/openapi/apis";
import { type UserOrg, type ApiError } from "@/generated/openapi/models";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ResponseError } from "@/generated/openapi/runtime";

export default function Navbar() {
  const { user, setUser, loading } = React.useContext(UserContext);
  const [orgs, setOrgs] = React.useState<UserOrg[] | null>(null);
  React.useEffect(() => {
    (async () => {
      try {
        const orgApi = new OrgApi();
        const orgs = await orgApi.getOrgs();
        setOrgs(orgs);
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
      }
    })();
  }, [loading]);

  const handleSelect = async (value: string) => {
    const orgId = parseInt(value);
    const org = orgs?.find((o) => o.id === orgId);
    if (!org) {
      toast("Something went wrong", {
        action: {
          label: "Close",
          onClick: () => {},
        },
      });
      return;
    }
    setUser((u) =>
      u
        ? {
            ...u,
            org,
          }
        : null,
    );
  };

  if (loading) {
    return;
  }

  return (
    <div className="sticky top-0 left-0 w-full flex justify-end gap-5 pr-5">
      {user ? (
        <>
          <Select
            defaultValue={user?.org.id.toString()}
            onValueChange={handleSelect}
          >
            <SelectTrigger className="p-6">
              <SelectValue placeholder="My Organizations" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {orgs
                  ? orgs.map((org) => (
                      <SelectItem value={org.id.toString()}>
                        {org.name}
                      </SelectItem>
                    ))
                  : null}
              </SelectGroup>
            </SelectContent>
          </Select>

          <DropdownMenu>
            <DropdownMenuTrigger>
              <img
                src={defaultPfp}
                alt="My Account Options"
                className="w-12 h-12"
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem>My Organizations</DropdownMenuItem>
              <form action="/api/logout" method="POST">
                <Button type="submit">Sign Out</Button>
              </form>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      ) : (
        <form action="/api/login" method="GET">
          <Button>Sign In</Button>
        </form>
      )}
    </div>
  );
}
