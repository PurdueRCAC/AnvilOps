import { Undo2 } from "lucide-react";
import { Link } from "react-router-dom";

export function GitHubApprovalPendingView() {
  return (
    <main className="flex flex-col items-center justify-center min-h-[80vh] space-y-2">
      <h1 className="text-black-4 text-4xl font-bold">
        Finish Setting Up Your GitHub App
      </h1>
      <p className="text-lg max-w-lg text-center text-balance">
        You have requested approval to install the GitHub App. When your request
        is approved, you will see an option to link it to an AnvilOps
        organization.
      </p>
      <Link to="/dashboard" className="text-lg underline">
        <Undo2 className="inline" size={24} />
        Back to Dashboard
      </Link>
    </main>
  );
}
