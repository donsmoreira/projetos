import {
  Navigate,
  Outlet
} from "react-router-dom";

import { useAuth } from "../contexts/AuthContext";

function ProtectedRoute() {
  const {
    session,
    loading
  } = useAuth();

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        Carregando...
      </div>
    );
  }

  if (!session) {
    return (
      <Navigate
        to="/login"
        replace
      />
    );
  }

  return <Outlet />;
}

export default ProtectedRoute;