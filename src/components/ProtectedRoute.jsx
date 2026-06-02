import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

/** Spinner shown while auth / profile is loading */
function Loader() {
  return (
    <div className="splash-loader">
      <div className="spinner" />
    </div>
  );
}

/** Any authenticated user */
export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Loader />;
  return user ? children : <Navigate to="/login" replace />;
}

/** Super-Admin only route — redirects others to their respective portals */
export function SuperAdminRoute({ children }) {
  const { user, role, loading } = useAuth();
  if (loading) return <Loader />;
  if (!user) return <Navigate to="/login" replace />;
  if (role === "gymowner") return <Navigate to="/dashboard" replace />;
  if (role === "member") return <Navigate to="/member-portal" replace />;
  return children;
}

/** Gym Owner only route — redirects others to their respective portals */
export function GymOwnerRoute({ children }) {
  const { user, role, loading } = useAuth();
  if (loading) return <Loader />;
  if (!user) return <Navigate to="/login" replace />;
  if (role === "admin") return <Navigate to="/super-admin" replace />;
  if (role === "member") return <Navigate to="/member-portal" replace />;
  return children;
}

// Keep AdminRoute as an alias to GymOwnerRoute for backward compatibility if needed, or we can update App.jsx
export { GymOwnerRoute as AdminRoute };

/** Member-only route — redirects others to their respective portals */
export function MemberRoute({ children }) {
  const { user, role, loading } = useAuth();
  if (loading) return <Loader />;
  if (!user) return <Navigate to="/login" replace />;
  if (role === "admin") return <Navigate to="/super-admin" replace />;
  if (role === "gymowner") return <Navigate to="/dashboard" replace />;
  return children;
}

/** Public route — redirects logged in users away from auth pages */
export function PublicRoute({ children }) {
  const { user, role, loading } = useAuth();
  if (loading) return <Loader />;
  if (user) {
    if (role === "admin") return <Navigate to="/super-admin" replace />;
    if (role === "gymowner") return <Navigate to="/dashboard" replace />;
    if (role === "member") return <Navigate to="/member-portal" replace />;
  }
  return children;
}
