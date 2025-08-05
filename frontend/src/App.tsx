import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useContext } from "react";
import { ErrorBoundary } from "react-error-boundary";
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

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppConfigProvider>
        <UserProvider>
          <Navbar />
          <ErrorBoundary
            fallbackRender={(props) => (
              <main className="flex flex-col items-center justify-center min-h-[80vh]">
                <h1 className="font-bold text-4xl mb-2">
                  Something went wrong.
                </h1>
                <p className="mb-8">
                  There was a problem displaying this page.
                </p>
                <pre className="whitespace-pre-line max-w-lg text-sm bg-gray-100 rounded-md border-input border p-2 mb-4 max-h-40 overflow-y-auto">
                  <code>
                    Additional information:{" "}
                    {props?.error?.message?.toString() ??
                      JSON.stringify(props?.error)}
                  </code>
                </pre>
                <Button onClick={() => window.location.reload()}>
                  Refresh
                </Button>
              </main>
            )}
          >
            <UnclaimedInstallations />
            <Routes>
              <Route path="/" element={<LandingView />} />
              <Route
                path="/dashboard"
                element={
                  <RequireAuth redirectTo="/api/login">
                    <DashboardView />
                  </RequireAuth>
                }
              />
              <Route
                path="/app/:id"
                element={
                  <RequireAuth redirectTo="/api/login">
                    <AppView />
                  </RequireAuth>
                }
              />
              <Route
                path="/app/:appId/deployment/:deploymentId"
                element={
                  <RequireAuth redirectTo="/api/login">
                    <DeploymentView />
                  </RequireAuth>
                }
              />
              <Route
                path="/create-app"
                element={
                  <RequireAuth redirectTo="/api/login">
                    <CreateAppView />
                  </RequireAuth>
                }
              />
              <Route
                path="/create-group"
                element={
                  <RequireAuth redirectTo="/api/login">
                    <CreateAppGroupView />
                  </RequireAuth>
                }
              />
              <Route
                path="/import-repo"
                element={
                  <RequireAuth redirectTo="/api/login">
                    <ImportRepoView />
                  </RequireAuth>
                }
              />
              <Route
                path="/organizations"
                element={
                  <RequireAuth redirectTo="/api/login">
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
          </ErrorBoundary>
        </UserProvider>
      </AppConfigProvider>
      <Toaster />
      <ReactQueryDevtools />
    </QueryClientProvider>
  );
}

function RequireAuth({
  children,
  redirectTo,
}: {
  children: React.ReactNode;
  redirectTo: string;
}) {
  const { user, loading } = useContext(UserContext);
  if (loading) return null;
  if (!user) {
    window.location.href = redirectTo;
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
          className="bg-green-500/20 border-green-900 border-2 rounded-md p-4 m-8"
          key={inst.id}
        >
          <h2 className="text-lg font-bold">Installation Approved</h2>
          <p>
            Your GitHub App installation request has been approved. To complete
            the process, choose an AnvilOps organization to link it to.
          </p>
          <form
            className="flex gap-2 items-center mt-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const orgId = formData.get("org")?.toString();
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
                  <SelectItem value={org.id.toString()}>{org.name}</SelectItem>
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
