import { useContext } from "react";
import { Link } from "react-router-dom";
import defaultPfp from "../assets/default_pfp.png";
import { useAppConfig } from "./AppConfigProvider";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { UserContext } from "./UserProvider";
import logo from "/anvilops.png";
export default function Navbar() {
  const { user, loading } = useContext(UserContext);

  const settings = useAppConfig();
  return (
    <div className="bg-gold sm:purdue-gradient sticky top-0 left-0 z-50 flex h-16 w-full items-center justify-between gap-4 border-b px-8 py-2 backdrop-blur-xl">
      <div className="flex items-end justify-center space-x-4">
        <Link
          to={user ? "/dashboard" : "/"}
          className="flex items-center gap-2 text-xl font-bold"
        >
          <img src={logo} alt="AnvilOps logo" className="h-10" />
        </Link>
        <p className="text-3xl italic">{settings.clusterName}</p>
      </div>
      <div className="flex items-center justify-end gap-8">
        {user && (
          <Link to="/" className="sm:text-white">
            Home
          </Link>
        )}
        <a
          href="https://docs.anvilcloud.rcac.purdue.edu"
          className="sm:text-white"
          target="_blank"
          rel="noreferrer"
        >
          Docs
        </a>
        {user && (
          <>
            <Link to="/dashboard" className="sm:text-white">
              Dashboard
            </Link>
            <Link to="/organizations" className="sm:text-white">
              Organizations
            </Link>
          </>
        )}
        {loading ? null : user ? (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger>
                <img
                  src={defaultPfp}
                  alt="My Account Options"
                  className="size-12 rounded-full bg-white"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem className="flex flex-col items-start gap-0">
                  <p>{user.name}</p>
                  <p className="opacity-50">{user.email}</p>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <form action="/api/logout" method="POST">
                    <button type="submit" className="text-destructive">
                      Sign Out
                    </button>
                  </form>
                </DropdownMenuItem>
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
