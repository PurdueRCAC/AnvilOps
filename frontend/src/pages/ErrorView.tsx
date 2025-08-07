import { Undo2 } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

type ErrorType = "login" | "github_app";
type ErrorCode =
  | "IDP_FAIL"
  | "RANCHER_ID_MISSING"
  | "STATE_FAIL"
  | "INSTALLATION_FAIL"
  | "DIFF_ACCOUNT"
  | "ORG_FAIL"
  | "";
export default function ErrorView() {
  const [search] = useSearchParams();
  return (
    <main className="flex flex-col items-center justify-center min-h-[80vh] space-y-2">
      <h1 className="text-black-4 text-4xl font-bold">
        {(() => {
          switch (search.get("type") as ErrorType | null) {
            case "login": {
              return "Error signing in!";
            }
            case "github_app": {
              return "Error installing GitHub App.";
            }
            default: {
              return "Error.";
            }
          }
        })()}
      </h1>
      <p className="text-lg">
        {(() => {
          switch (search.get("code") as ErrorCode | null) {
            case "IDP_FAIL": {
              return "Cannot sign in with that identity provider.";
            }
            case "RANCHER_ID_MISSING": {
              return "Could not find your account on Rancher. Please contact your administrator.";
            }
            case "STATE_FAIL": {
              return "Failed to verify state.";
            }
            case "INSTALLATION_FAIL": {
              return "Failed to verify installation.";
            }
            case "DIFF_ACCOUNT": {
              return "You signed in with a different GitHub account!";
            }
            default: {
              return "An error occurred.";
            }
          }
        })()}
      </p>
      <Link to="/" className="text-lg underline">
        <Undo2 className="inline" size={24} />
        Back to Home
      </Link>
    </main>
  );
}
