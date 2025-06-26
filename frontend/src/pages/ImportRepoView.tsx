import { api } from "@/lib/api";
import { Loader } from "lucide-react";
import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

export const ImportRepoView = () => {
  const [search] = useSearchParams();
  const navigate = useNavigate();

  const { mutateAsync: importRepo } = api.useMutation("post", "/import-repo");

  useEffect(() => {
    (async () => {
      try {
        const response = await importRepo({
          body: {
            state: search.get("state")!.toString(),
            code: search.get("code")?.toString(),
          },
        });

        if (response.url) {
          // If `url` is specified in the response, then we need to authorize with GitHub.
          // Redirect there and it'll redirect back to this page (with a `code` and `state`) when done.
          window.location.href = response.url;
        }
      } catch (e) {
        toast.error("Something went wrong while importing a repository.");
        navigate("/create-app");
        return;
      }
      toast.success("Repository imported!");
      navigate("/create-app");
      try {
        // If this page was opened as a popup, we can close it
        window.close();
      } catch {}
    })();
  }, []);

  return (
    <main className="flex flex-col min-h-[80vh] items-center justify-center">
      <Loader className="animate-spin mx-auto mb-4" />
      <h1 className="text-2xl font-medium">Importing repository...</h1>
      <p className="mt-4 max-w-sm text-center text-pretty">
        This may take a minute. The page will update automatically when the
        process is complete.
      </p>
    </main>
  );
};
