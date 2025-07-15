import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useContext } from "react";
import { Route, Routes } from "react-router-dom";
import Navbar from "./components/Navbar";
import { Toaster } from "./components/ui/sonner";
import UserProvider, { UserContext } from "./components/UserProvider";
import { queryClient } from "./lib/api";
import AppView from "./pages/app/AppView";
import CreateAppView from "./pages/create-app/CreateAppView";
import DashboardView from "./pages/DashboardView";
import { DeploymentView } from "./pages/DeploymentView";
import { ImportRepoView } from "./pages/ImportRepoView";
import LandingView from "./pages/LandingView";
import NotFoundView from "./pages/NotFoundView";
import OrgView from "./pages/OrgView";
import UnavailableView from "./pages/UnavailableView";
import CreateAppGroupView from "./pages/create-app/CreateAppGroupView";

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <UserProvider>
        <Navbar />
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
          <Route path="/unavailable" element={<UnavailableView />} />
          <Route path="*" element={<NotFoundView />} />
        </Routes>
      </UserProvider>
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
