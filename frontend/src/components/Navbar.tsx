import { useContext } from "react";
import { Link, useNavigate } from "react-router-dom";
import defaultPfp from "../assets/default_pfp.png";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { UserContext } from "./UserProvider";

export default function Navbar() {
  const { user, loading } = useContext(UserContext);

  const navigate = useNavigate();

  const handleSelect = async (value: string) => {
    const orgId = parseInt(value);
    navigate(`/org/${orgId}`);
  };

  return (
    <div className="sticky top-0 left-0 w-full flex justify-between items-center px-8 py-2 border-b gap-4 bg-white/50 backdrop-blur-xl h-16 z-50">
      <p className="text-lg font-bold">
        <Link to="/dashboard">AnvilOps</Link>
      </p>
      <div className="flex gap-4 justify-end">
        {loading ? null : user ? (
          <>
            <Select onValueChange={handleSelect}>
              <SelectTrigger className="p-6" size="sm">
                <SelectValue placeholder="My Organizations" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {user?.orgs?.map((org) => (
                    <SelectItem value={org.id.toString()}>
                      {org.name}
                    </SelectItem>
                  ))}
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
                <DropdownMenuSeparator />
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
    </div>
  );
}
