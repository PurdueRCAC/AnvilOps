import { UserContext } from "@/components/UserProvider";
import { Undo2 } from "lucide-react";
import { useContext } from "react";
import { Link } from "react-router-dom";

export default function UnavailableView() {
  const { user } = useContext(UserContext);
  return (
    <main className="py-2 px-2 lg:py-10 lg:px-12">
      <h3 className="text-black-4 text-3xl font-bold">
        This app is not available.
      </h3>
      <Link to={user ? "/dashboard" : "/"} className="text-lg underline">
        <Undo2 className="inline" size={24} />
        Go {user ? "to Dashboard" : "Home"}
      </Link>
    </main>
  );
}
