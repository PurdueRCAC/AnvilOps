import { useContext } from "react";
import { Link } from "react-router-dom";
import defaultPfp from "../assets/default_pfp.png";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { UserContext } from "./UserProvider";

export default function Navbar() {
  const { user, loading } = useContext(UserContext);

  return (
    <div className="sticky top-0 left-0 w-full flex justify-between items-center px-8 py-2 border-b gap-4 bg-gold backdrop-blur-xl h-16">
      <p className="text-2xl font-semibold">
        <Link to="/dashboard" className="font-main">
          AnvilOps
        </Link>
      </p>
      <div className="flex gap-4 justify-end">
        {loading ? null : user ? (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger>
                <img
                  src={defaultPfp}
                  alt="My Account Options"
                  className="w-12 h-12"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-64">
                <DropdownMenuLabel>
                  <p>{user.name}</p>
                  <p className="opacity-50">{user.email}</p>
                </DropdownMenuLabel>
                <DropdownMenuItem asChild>
                  <Link to="/organizations">My Organizations</Link>
                </DropdownMenuItem>
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
