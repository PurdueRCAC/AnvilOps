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
    onError: (error) =>
      toast.error(
        `Something went wrong: ${error.message ?? error.toString() ?? error}`,
      ),
  }),
});
