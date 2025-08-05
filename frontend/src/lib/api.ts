import {
  MutationCache,
  QueryCache,
  QueryClient,
  type DefaultError,
} from "@tanstack/react-query";
import createFetchClient from "openapi-fetch";
import createClient from "openapi-react-query";
import { toast } from "sonner";
import { type paths } from "../generated/openapi";

const fetchClient = createFetchClient<paths>({
  baseUrl: "/api",
});

export const api = createClient(fetchClient);

const onError = (error: DefaultError) => {
  if (
    ("code" in error && error?.code === 401) ||
    error?.message === "Unauthorized"
  ) {
    window.location.href = "/api/login";
  }
  toast.error(
    `Something went wrong: ${error.message ?? JSON.stringify(error)}`,
  );
};

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
});
