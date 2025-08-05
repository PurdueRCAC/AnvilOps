import { useContext } from "react";
import { Link } from "react-router-dom";
import defaultPfp from "../assets/default_pfp.png";
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

  return (
    <div className="sticky top-0 left-0 w-full flex justify-between items-center px-8 py-2 bg-gold sm:purdue-gradient border-b gap-4 backdrop-blur-xl h-16 z-50">
      <p className="text-xl font-bold">
        <Link
          to={user ? "/dashboard" : "/"}
          className="flex items-center gap-2"
        >
          <img src={logo} className="h-10" />
        </Link>
      </p>
      <div className="flex gap-8 justify-end items-center">
        {user && (
          <Link to="/" className="sm:text-white">
            Home
          </Link>
        )}
        <a
          href="https://docs.anvilops.rcac.purdue.edu"
          className="sm:text-white"
          target="_blank"
        >
          Docs
        </a>
        {user && (
          <>
            <Link to="/dashboard" className="sm:text-white">
              Dashboard
            </Link>
            {/* <Link to="/organizations" className="sm:text-white">
              Organizations
            </Link> */}
          </>
        )}
        {loading ? null : user ? (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger>
                <img
                  src={defaultPfp}
                  alt="My Account Options"
                  className="w-12 h-12 rounded-full bg-white"
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
