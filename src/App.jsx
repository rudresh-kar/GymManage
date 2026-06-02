import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth }  from "./contexts/AuthContext";
import ProtectedRoute, { SuperAdminRoute, GymOwnerRoute, MemberRoute, PublicRoute } from "./components/ProtectedRoute";
import LoginPage         from "./pages/LoginPage";
import RegisterPage      from "./pages/RegisterPage";
import DashboardPage     from "./pages/DashboardPage";
import MembersPage       from "./pages/MembersPage";
import AttendancePage    from "./pages/AttendancePage";
import PaymentsPage      from "./pages/PaymentsPage";
import MemberPortalPage  from "./pages/MemberPortalPage";
import SuperAdminPage    from "./pages/SuperAdminPage";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* ── Public ─────────────────────────────────────────────── */}
          <Route path="/login"    element={<PublicRoute><LoginPage /></PublicRoute>} />
          <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />

          {/* ── Super-Admin only ───────────────────────────────────── */}
          <Route path="/super-admin" element={<SuperAdminRoute><SuperAdminPage /></SuperAdminRoute>} />

          {/* ── Gym Owner only ─────────────────────────────────────── */}
          <Route path="/dashboard"  element={<GymOwnerRoute><DashboardPage /></GymOwnerRoute>} />
          <Route path="/members"    element={<GymOwnerRoute><MembersPage /></GymOwnerRoute>} />
          <Route path="/attendance" element={<GymOwnerRoute><AttendancePage /></GymOwnerRoute>} />
          <Route path="/payments"   element={<GymOwnerRoute><PaymentsPage /></GymOwnerRoute>} />

          {/* ── Member-only ─────────────────────────────────────────── */}
          <Route path="/member-portal" element={<MemberRoute><MemberPortalPage /></MemberRoute>} />

          {/* ── Redirects ───────────────────────────────────────────── */}
          <Route path="/"  element={<RootRedirect />} />
          <Route path="*"  element={<RootRedirect />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

function RootRedirect() {
  const { user, role, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (role === "admin") return <Navigate to="/super-admin" replace />;
  if (role === "gymowner") return <Navigate to="/dashboard" replace />;
  if (role === "member") return <Navigate to="/member-portal" replace />;
  return <Navigate to="/login" replace />;
}
