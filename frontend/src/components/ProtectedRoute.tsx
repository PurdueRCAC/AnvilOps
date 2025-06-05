import { Route, Navigate } from "react-router-dom";
import { UserContext } from "./UserProvider";
import React from "react";

export default function ProtectedRoute({
  path,
  element,
}: React.ComponentProps<typeof Route>) {
  const { user } = React.useContext(UserContext);
  return (
    <Route path={path} element={user ? element : <Navigate to="/sign-in" />} />
  );
}
