import { QueryCache, QueryClient } from "@tanstack/react-query";
import createFetchClient from "openapi-fetch";
import createClient from "openapi-react-query";
import { toast } from "sonner";
import { type paths } from "../generated/openapi";

const fetchClient = createFetchClient<paths>({
  baseUrl: "/api",
});

export const api = createClient(fetchClient);

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      if (
        ("code" in error && error?.code === 401) ||
        error?.message === "Unauthorized"
      ) {
        return;
      }
      toast.error(
        `Something went wrong: ${error.message ?? error.toString() ?? error}`,
      );
    },
  }),
});
