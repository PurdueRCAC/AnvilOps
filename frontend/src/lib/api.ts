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
import { type components, type paths } from "../generated/openapi";

const acceptJson = new Headers();
acceptJson.set("Accept", "application/json");

const fetchClient = createFetchClient<paths>({
  baseUrl: "/api",
  headers: acceptJson,
});

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
  toast.error(
    `Something went wrong: ${error.message ?? JSON.stringify(error)}`,
  );
};

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
});

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const USER_ME_QUERY_KEY = ["get", "/user/me", {}] as const;

fetchClient.use({
  async onRequest({ request }) {
    if (MUTATING_METHODS.has(request.method)) {
      const user =
        queryClient.getQueryData<components["schemas"]["User"]>(
          USER_ME_QUERY_KEY,
        );
      if (user?.csrfToken) {
        request.headers.set("X-CSRF-Token", user.csrfToken);
      }
    }
    return request;
  },
});

export const api = createClient(fetchClient);
