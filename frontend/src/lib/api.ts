import {
  MutationCache,
  QueryCache,
  QueryClient,
  type DefaultError,
  type Mutation,
  type Query,
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

const onQueryError = (
  error: DefaultError,
  query: Query<unknown, unknown, unknown>,
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
  if (query.queryHash === '["get","/user/me",{}]') {
    // Don't show the error toast for the initial /user/me request
    return;
  }
  toast.error(
    `Something went wrong: ${error.message ?? JSON.stringify(error)}`,
  );
};

const onMutationError = (
  error: DefaultError,
  _variables: unknown,
  _context: unknown,
  _mutation: Mutation<unknown, unknown, unknown>,
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
  toast.error(
    `Something went wrong: ${error.message ?? JSON.stringify(error)}`,
  );
};

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onQueryError }),
  mutationCache: new MutationCache({ onError: onMutationError }),
});
