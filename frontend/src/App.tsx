import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useContext } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Navbar from "./components/Navbar";
import UserProvider, { UserContext } from "./components/UserProvider";
import { Toaster } from "./components/ui/sonner";
import { queryClient } from "./lib/api";
import AppView from "./pages/AppView";
import CreateAppView from "./pages/CreateAppView";
import DashboardView from "./pages/DashboardView";
import LandingView from "./pages/LandingView";

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
            path="/create-app"
            element={
              <RequireAuth redirectTo="/api/login">
                <CreateAppView />
              </RequireAuth>
            }
          />
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
  return user ? children : <Navigate to={redirectTo} />;
}
export default App;
