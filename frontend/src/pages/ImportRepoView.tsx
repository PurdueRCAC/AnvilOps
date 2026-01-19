import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { ArrowLeft, CircleX, Loader } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

export const ImportRepoView = () => {
  const [search] = useSearchParams();
  const navigate = useNavigate();

  const { mutateAsync: importRepo } = api.useMutation("post", "/import-repo");

  const [isError, setError] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const response = await importRepo({
          body: {
            state: search.get("state")!.toString(),
            code: search.get("code")?.toString(),
          },
        });

        toast.success("Repository imported!");
        navigate(`/create-app?org=${response.orgId}&repo=${response.repoId}`);
      } catch (e) {
        setError(true);
        return;
      }
    })();
  }, []);

  return (
    <main className="flex min-h-[80vh] flex-col items-center justify-center">
      {isError ? (
        <>
          <CircleX className="mx-auto mb-4 text-red-500" />
          <h1 className="text-2xl font-medium">Error Importing Repository</h1>
          <p className="mt-4 max-w-sm text-center text-pretty">
            Something went wrong while importing your repository.
          </p>
          <Link to={`/create-app`} className="mt-4 block">
            <Button>
              <ArrowLeft /> Back to Create App
            </Button>
          </Link>
        </>
      ) : (
        <>
          <Loader className="mx-auto mb-4 animate-spin" />
          <h1 className="text-2xl font-medium">Importing repository...</h1>
          <p className="mt-4 max-w-sm text-center text-pretty">
            This may take a minute. The page will update automatically when the
            process is complete.
          </p>
        </>
      )}
    </main>
  );
};
