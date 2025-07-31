import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useContext } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { Route, Routes } from "react-router-dom";
import { AppConfigProvider } from "./components/AppConfigProvider";
import Navbar from "./components/Navbar";
import { Button } from "./components/ui/button";
import { Toaster } from "./components/ui/sonner";
import UserProvider, { UserContext } from "./components/UserProvider";
import { queryClient } from "./lib/api";
import AppView from "./pages/app/AppView";
import CreateAppGroupView from "./pages/create-app/CreateAppGroupView";
import CreateAppView from "./pages/create-app/CreateAppView";
import DashboardView from "./pages/DashboardView";
import { DeploymentView } from "./pages/DeploymentView";
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
              <Route path="/organizations" element={<OrgView />} />
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
export default App;
