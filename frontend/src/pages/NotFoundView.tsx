import { UserContext } from "@/components/UserProvider";
import { Undo2 } from "lucide-react";
import { useContext } from "react";
import { Link } from "react-router-dom";

export default function NotFoundView() {
  const { user } = useContext(UserContext);
  return (
    <main className="flex min-h-[80vh] flex-col items-center justify-center space-y-2">
      <h3 className="text-black-4 text-3xl font-bold">Not Found.</h3>
      <Link to={user ? "/dashboard" : "/"} className="text-lg underline">
        <Undo2 className="inline" size={24} />
        Back {user ? "to Dashboard" : "Home"}
      </Link>
    </main>
  );
}
