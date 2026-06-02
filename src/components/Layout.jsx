import { useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { logoutUser } from "../firebase/auth";
import { useNavigate } from "react-router-dom";

const ownerLinks = [
  { 
    to: "/dashboard",  
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    ), 
    label: "Dashboard"  
  },
  { 
    to: "/members",    
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ), 
    label: "Members"    
  },
  { 
    to: "/attendance", 
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="9 11 12 14 22 4"/>
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
      </svg>
    ), 
    label: "Attendance" 
  },
  { 
    to: "/payments",   
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect width="20" height="14" x="2" y="5" rx="2"/>
        <line x1="2" x2="22" y1="10" y2="10"/>
      </svg>
    ), 
    label: "Payments"   
  },
];

const superAdminLinks = [
  { 
    to: "/super-admin", 
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
    ), 
    label: "Super Admin" 
  },
];

export default function Layout({ children, title, subtitle }) {
  const { user, role, userProfile } = useAuth();
  const navigate = useNavigate();
  const [isSidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await logoutUser();
    navigate("/login");
  };

  const closeSidebar = () => setSidebarOpen(false);

  const activeLinks = role === "admin" ? superAdminLinks : ownerLinks;

  return (
    <div className="app-layout">
      {/* Mobile backdrop */}
      {isSidebarOpen && (
        <div className="sidebar-backdrop" onClick={closeSidebar} aria-hidden="true" />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${isSidebarOpen ? "open" : ""}`}>
        <div className="sidebar-logo">
          <span className="logo-icon" style={{ display: "inline-flex", alignItems: "center" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--cyan)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m6.5 6.5 11 11"/>
              <path d="m21 21-1-1"/>
              <path d="m3 3 1 1"/>
              <path d="m18 22 4-4"/>
              <path d="m2 6 4-4"/>
              <path d="m3 10 7-7"/>
              <path d="m14 21 7-7"/>
              <path d="M6.5 12.5 12.5 6.5"/>
              <path d="m11.5 17.5 6-6"/>
            </svg>
          </span>
          <span className="logo-text">FlexPro</span>
          <button className="sidebar-close-btn" onClick={closeSidebar}>✕</button>
        </div>

        <nav className="sidebar-nav">
          {activeLinks.map(({ to, icon, label }) => (
            <NavLink
              key={to}
              to={to}
              id={`nav-${label.toLowerCase().replace(" ", "-")}`}
              onClick={closeSidebar}
              className={({ isActive }) =>
                isActive ? "nav-item active" : "nav-item"
              }
            >
              <span className="nav-icon">{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>

        <button
          id="sidebar-logout"
          className="sidebar-logout"
          onClick={handleLogout}
        >
          <span className="nav-icon" style={{ display: "inline-flex", alignItems: "center" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" x2="9" y1="12" y2="12" />
            </svg>
          </span> Logout
        </button>
      </aside>

      {/* Main content */}
      <main className="main-content">
        <header className="topbar">
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            {role !== "gymowner" && (
              <button
                className="hamburger-btn"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open menu"
              >
                ☰
              </button>
            )}
            <div>
              <h1 className="page-title">{title}</h1>
              {subtitle && <p className="page-sub">{subtitle}</p>}
            </div>
          </div>
          
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {role === "gymowner" && (
              <button 
                className="portal-logout-btn" 
                onClick={handleLogout} 
                title="Logout"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" x2="9" y1="12" y2="12" />
                </svg>
              </button>
            )}
            <div
              className="topbar-avatar"
              onClick={() => navigate(role === "admin" ? "/super-admin" : "/dashboard")}
              style={{ cursor: "pointer" }}
              title="View Profile"
            >
              {userProfile?.name?.[0]?.toUpperCase() || user?.displayName?.[0]?.toUpperCase() || "A"}
            </div>
          </div>
        </header>

        {children}
      </main>

      {/* Bottom navigation for Gym Owner on Mobile */}
      {role === "gymowner" && (
        <nav className="owner-bottomnav" aria-label="Owner navigation">
          {activeLinks.map(({ to, icon, label }) => (
            <NavLink
              key={to}
              to={to}
              id={`bottom-nav-${label.toLowerCase().replace(" ", "-")}`}
              className={({ isActive }) =>
                isActive ? "owner-nav-btn active" : "owner-nav-btn"
              }
            >
              <span className="owner-nav-icon">{icon}</span>
              <span className="owner-nav-label">{label}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}
