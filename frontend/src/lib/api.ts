import {
  MutationCache,
  QueryCache,
  QueryClient,
  type DefaultError,
  type Mutation,
  type MutationFunctionContext,
  type QueryOptions,
} from "@tanstack/react-query";
import createFetchClient from "openapi-fetch";
import createClient from "openapi-react-query";
import { toast } from "sonner";
import { type paths } from "../generated/openapi";

const fetchClient = createFetchClient<paths>({
  baseUrl: "/api",
});

export const api = createClient(fetchClient);

/**
 * When the user visits one of these pages, they won't be redirected to the sign-in page if they're logged out.
 */
const ALLOWED_UNAUTHENTICATED = ["/", "/error"];

const onError = (
  error: DefaultError,
  ...args:
    | [QueryOptions]
    | [
        unknown,
        unknown,
        Mutation<unknown, unknown, unknown>,
        MutationFunctionContext,
      ]
) => {
  if (
    ("code" in error && error?.code === 401) ||
    error?.message === "Unauthorized"
  ) {
    if (!ALLOWED_UNAUTHENTICATED.includes(window.location.pathname)) {
      window.location.href = "/api/login";
      return;
    }
  }
  if (args.length === 1 && args[0].queryHash === '["get","/user/me",{}]') {
    // Don't show the error toast for the initial /user/me request
    return;
  }
  // Don't show error toast for 404s on the branches endpoint
  if (
    args.length === 1 &&
    "code" in error &&
    error.code === 404 &&
    typeof args[0].queryHash === "string" &&
    args[0].queryHash.includes("/repos/") &&
    args[0].queryHash.includes("/branches")
  ) {
    return;
  }
  toast.error(
    `Something went wrong: ${error.message ?? JSON.stringify(error)}`,
  );
};

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
});
