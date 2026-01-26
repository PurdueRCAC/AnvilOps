import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { Loader } from "lucide-react";
import { Suspense, useContext } from "react";
import { ErrorBoundary, type FallbackProps } from "react-error-boundary";
import { Route, Routes } from "react-router-dom";
import { toast } from "sonner";
import { AppConfigProvider } from "./components/AppConfigProvider";
import Navbar from "./components/Navbar";
import { Button } from "./components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./components/ui/select";
import { Toaster } from "./components/ui/sonner";
import UserProvider, { UserContext } from "./components/UserProvider";
import { api, queryClient } from "./lib/api";
import AppView from "./pages/app/AppView";
import { GitHubApprovalPendingView } from "./pages/app/GitHubApprovalPendingView";
import CreateAppGroupView from "./pages/create-app/CreateAppGroupView";
import CreateAppView from "./pages/create-app/CreateAppView";
import DashboardView from "./pages/DashboardView";
import { DeploymentView } from "./pages/DeploymentView";
import ErrorView from "./pages/ErrorView";
import { ImportRepoView } from "./pages/ImportRepoView";
import LandingView from "./pages/LandingView";
import NotFoundView from "./pages/NotFoundView";
import OrgView from "./pages/OrgView";

const SuspenseFallback = (
  <div className="flex size-full min-h-[calc(100vh-4rem)] items-center justify-center">
    <Loader className="animate-spin" size="2.5rem" />
  </div>
);

function getErrorMessage(props: FallbackProps) {
  const error: unknown = props.error;
  if (error !== null && typeof error === "object" && "message" in error) {
    if (typeof error.message === "string") {
      return error.message;
    }
    const message = (props.error as Record<string, unknown>).message;
    return JSON.stringify(message);
  }
  return JSON.stringify(props?.error);
}

function App() {
  return (
    <ErrorBoundary
      fallbackRender={(props) => (
        <>
          <Navbar />
          <main className="flex min-h-[80vh] flex-col items-center justify-center">
            <h1 className="mb-2 text-4xl font-bold">Something went wrong.</h1>
            <p className="mb-8">There was a problem displaying this page.</p>
            <pre className="border-input mb-4 max-h-40 max-w-lg overflow-y-auto rounded-md border bg-gray-100 p-2 text-sm whitespace-pre-line">
              <code>Additional information: {getErrorMessage(props)}</code>
            </pre>
            <Button onClick={() => window.location.reload()}>Refresh</Button>
          </main>
        </>
      )}
    >
      <QueryClientProvider client={queryClient}>
        <AppConfigProvider>
          <UserProvider>
            <Navbar />
            <UnclaimedInstallations />
            <Suspense fallback={SuspenseFallback}>
              <Routes>
                <Route path="/" element={<LandingView />} />
                <Route
                  path="/dashboard"
                  element={
                    <RequireAuth>
                      <DashboardView />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/app/:id"
                  element={
                    <RequireAuth>
                      <AppView />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/app/:appId/deployment/:deploymentId"
                  element={
                    <RequireAuth>
                      <DeploymentView />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/create-app"
                  element={
                    <RequireAuth>
                      <CreateAppView />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/create-group"
                  element={
                    <RequireAuth>
                      <CreateAppGroupView />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/import-repo"
                  element={
                    <RequireAuth>
                      <ImportRepoView />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/organizations"
                  element={
                    <RequireAuth>
                      <OrgView />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/github-approval-pending"
                  element={<GitHubApprovalPendingView />}
                />
                <Route path="/error" element={<ErrorView />} />
                <Route path="*" element={<NotFoundView />} />
              </Routes>
            </Suspense>
          </UserProvider>
        </AppConfigProvider>
        <Toaster />
        <ReactQueryDevtools />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading, error } = useContext(UserContext);
  if (loading) return SuspenseFallback;
  if (!user) {
    if (error && error?.code !== 401) {
      // ^ 401 is Unauthorized; the user needs to sign in again
      throw new Error(
        "Failed to fetch your account information: " + JSON.stringify(error),
      );
    } else {
      // eslint-disable-next-line react-hooks/immutability
      window.location.href = "/api/login";
    }
  }

  return children;
}

function UnclaimedInstallations() {
  const user = useContext(UserContext);
  const installations = user?.user?.unassignedInstallations;
  const orgs = user?.user?.orgs;

  const { mutateAsync: claimOrg } = api.useMutation(
    "post",
    "/org/{orgId}/claim",
  );

  if (!installations) return;

  return (
    <>
      {installations.map((inst) => (
        <div
          className="m-8 rounded-md border-2 border-green-900 bg-green-500/20 p-4"
          key={inst.id}
        >
          <h2 className="text-lg font-bold">Installation Approved</h2>
          <p>
            Your GitHub App installation request has been approved. To complete
            the process, choose an AnvilOps organization to link it to.
          </p>
          <form
            className="mt-2 flex items-center gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const orgId = formData.get("org") as string;
              if (!orgId) return;
              const parsed = parseInt(orgId);
              try {
                await claimOrg({
                  params: { path: { orgId: parsed } },
                  body: { unclaimedInstallationId: inst.id },
                });
                toast.success(
                  "GitHub connection claimed! Your organization is now linked to GitHub.",
                );
              } catch (e) {
                console.error(e);
                toast.error("There was a problem claiming that organization.");
              }
            }}
          >
            <Select name="org">
              <SelectTrigger className="bg-background">
                <SelectValue placeholder="Select an organization..." />
              </SelectTrigger>
              <SelectContent>
                {orgs?.map((org) => (
                  <SelectItem value={org.id.toString()} key={org.id}>
                    {org.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit">Save</Button>
          </form>
        </div>
      ))}
    </>
  );
}

export default App;
