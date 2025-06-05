import Navbar from "./components/Navbar";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import LandingView from "./pages/LandingView";
import DashboardView from "./pages/DashboardView";
import AppView from "./pages/AppView";
import SignInView from "./pages/SignInView";
import CreateAppView from "./pages/CreateAppView";
import UserProvider, { UserContext } from "./components/UserProvider";
import { Toaster } from "./components/ui/sonner";
import { useContext } from "react";
function App() {
  return (
    <>
      <UserProvider>
        <Navbar />
        <Routes>
          <Route path="/" element={<LandingView />} />
          <Route
            path="/dashboard"
            element={
              <RequireAuth redirectTo="/sign-in">
                <DashboardView />
              </RequireAuth>
            }
          />
          <Route
            path="/app/:id"
            element={
              <RequireAuth redirectTo="/sign-in">
                <AppView />
              </RequireAuth>
            }
          />
          <Route path="/sign-in" element={<SignInView />} />
          <Route
            path="/create-app"
            element={
              <RequireAuth redirectTo="/sign-in">
                <CreateAppView />
              </RequireAuth>
            }
          />
        </Routes>
      </UserProvider>
      <Toaster />
    </>
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
