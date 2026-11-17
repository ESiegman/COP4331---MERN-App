import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../utils/useAuth";

// Only shows its page to a logged-in user; everyone else goes to the login page
// and comes back here afterwards.
function RequireLogin({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

export default RequireLogin;
