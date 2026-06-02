import { useState, useEffect, useRef } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { logoutUser, updateUserEmail, updateUserPhone } from "../firebase/auth";
import { updateDocument } from "../firebase/firestore";
import { useNavigate } from "react-router-dom";
import { BRAND_NAME } from "../constants";

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
  const [isProfileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Email update form states
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [emailSuccess, setEmailSuccess] = useState("");
  const [updatingEmail, setUpdatingEmail] = useState(false);

  // Contact update form states
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [newContact, setNewContact] = useState("");
  const [contactError, setContactError] = useState("");
  const [contactSuccess, setContactSuccess] = useState("");
  const [updatingContact, setUpdatingContact] = useState(false);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setProfileDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Reset form states when dropdown closes
  useEffect(() => {
    if (!isProfileDropdownOpen) {
      setIsEditingEmail(false);
      setNewEmail("");
      setEmailError("");
      setEmailSuccess("");
      setUpdatingEmail(false);
      setIsEditingContact(false);
      setNewContact("");
      setContactError("");
      setContactSuccess("");
      setUpdatingContact(false);
    }
  }, [isProfileDropdownOpen]);

  const handleLogout = async () => {
    await logoutUser();
    navigate("/login");
  };

  const handleUpdateEmail = async (e) => {
    e.preventDefault();
    if (!newEmail.trim()) return setEmailError("Email is required.");
    
    setUpdatingEmail(true);
    setEmailError("");
    setEmailSuccess("");
    try {
      // 1. Update in Firebase Auth
      const res = await updateUserEmail(newEmail.trim());

      // 2. Update in Firestore users collection
      if (user?.uid) {
        await updateDocument("users", user.uid, {
          email: newEmail.trim()
        });
      }

      if (res && res.verified === false) {
        setEmailSuccess("Verification email sent! Please check your new email inbox to complete the update.");
      } else {
        setEmailSuccess("Email updated successfully!");
      }
      setIsEditingEmail(false);
    } catch (err) {
      console.error("Failed to update owner email:", err);
      if (err.code === "auth/requires-recent-login") {
        setEmailError("For security, please logout and log back in to verify your session first.");
      } else if (err.code === "auth/email-already-in-use") {
        setEmailError("This email is already in use by another account.");
      } else if (err.code === "auth/invalid-email") {
        setEmailError("Please enter a valid email address.");
      } else {
        setEmailError(err.message || "Failed to update email.");
      }
    } finally {
      setUpdatingEmail(false);
    }
  };

  const handleUpdateContact = async (e) => {
    e.preventDefault();
    const cleanPhone = newContact.replace(/[^0-9]/g, "");
    if (cleanPhone.length !== 10) return setContactError("Contact number must be exactly 10 digits.");
    
    setUpdatingContact(true);
    setContactError("");
    setContactSuccess("");
    try {
      // 1. Update in Firebase Auth if dummy email is used
      let isVerifiedChange = true;
      if (userProfile?.contact !== cleanPhone) {
        const res = await updateUserPhone(cleanPhone);
        if (res && res.verified === false) {
          isVerifiedChange = false;
        }
      }

      // 2. Update in Firestore users collection
      if (user?.uid) {
        await updateDocument("users", user.uid, {
          contact: cleanPhone
        });
      }

      if (!isVerifiedChange) {
        setContactSuccess("Verification email sent! Please check your new dummy email inbox to complete the update.");
      } else {
        setContactSuccess("Contact updated successfully!");
      }
      setIsEditingContact(false);
    } catch (err) {
      console.error("Failed to update owner contact:", err);
      setContactError(err.message || "Failed to update contact.");
    } finally {
      setUpdatingContact(false);
    }
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
          <span className="logo-text">{BRAND_NAME}</span>
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
          
          <div style={{ display: "flex", alignItems: "center", gap: "12px", position: "relative" }} ref={dropdownRef}>
            <div
              className="topbar-avatar"
              onClick={() => setProfileDropdownOpen(!isProfileDropdownOpen)}
              style={{ cursor: "pointer" }}
              title="View Profile"
            >
              {userProfile?.name?.[0]?.toUpperCase() || user?.displayName?.[0]?.toUpperCase() || "A"}
            </div>

            {isProfileDropdownOpen && (
              <div 
                className="profile-dropdown"
                style={{
                  position: "absolute",
                  right: 0,
                  top: "48px",
                  background: "var(--bg-card, #ffffff)",
                  border: "1px solid var(--border, #e5e7eb)",
                  borderRadius: "12px",
                  boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
                  padding: "16px",
                  minWidth: "220px",
                  zIndex: 1000,
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px"
                }}
              >
                 <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <span style={{ fontSize: "0.72rem", color: "var(--text-muted, #6b7280)", textTransform: "uppercase", fontWeight: "bold", letterSpacing: "0.05em" }}>Owner Name</span>
                  <span style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary, #111827)" }}>{userProfile?.name || "Gym Owner"}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <span style={{ fontSize: "0.72rem", color: "var(--text-muted, #6b7280)", textTransform: "uppercase", fontWeight: "bold", letterSpacing: "0.05em" }}>Contact Number</span>
                  <span style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--text-primary, #111827)" }}>{userProfile?.contact || "—"}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <span style={{ fontSize: "0.72rem", color: "var(--text-muted, #6b7280)", textTransform: "uppercase", fontWeight: "bold", letterSpacing: "0.05em" }}>Email Address</span>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <span style={{ fontSize: "0.85rem", color: "var(--text-secondary, #4b5563)", wordBreak: "break-all" }}>{userProfile?.email || user?.email}</span>
                    {userProfile?.email?.endsWith("@flexpro.in") && (
                      <span style={{ fontSize: "0.7rem", color: "var(--amber, #d97706)", fontWeight: "600", marginTop: "2px" }}>
                        ⚠️ Using dummy email
                      </span>
                    )}
                  </div>
                </div>

                {isEditingEmail ? (
                  <form onSubmit={handleUpdateEmail} style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "4px" }}>
                    <input
                      type="email"
                      placeholder="Enter new email..."
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      required
                      style={{
                        padding: "6px 10px",
                        fontSize: "0.8rem",
                        borderRadius: "6px",
                        border: "1px solid var(--border, #e5e7eb)",
                        background: "var(--bg-base, #f9fafb)",
                        color: "var(--text-primary, #111827)",
                        width: "100%"
                      }}
                    />
                    {emailError && (
                      <span style={{ fontSize: "0.7rem", color: "var(--rose, #ef4444)", fontWeight: "500" }}>{emailError}</span>
                    )}
                    <div style={{ display: "flex", gap: "6px", marginTop: "2px" }}>
                      <button
                        type="button"
                        onClick={() => setIsEditingEmail(false)}
                        className="btn btn-ghost"
                        style={{ padding: "4px 8px", fontSize: "0.75rem", borderRadius: "6px", flex: 1, borderColor: "var(--border)" }}
                        disabled={updatingEmail}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="btn btn-primary"
                        style={{ padding: "4px 8px", fontSize: "0.75rem", borderRadius: "6px", flex: 1 }}
                        disabled={updatingEmail}
                      >
                        {updatingEmail ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const isDummy = userProfile?.email?.endsWith("@flexpro.in");
                        setNewEmail(isDummy ? "" : (userProfile?.email || ""));
                        setIsEditingEmail(true);
                      }}
                      className="btn btn-ghost"
                      style={{
                        padding: "6px 10px",
                        fontSize: "0.75rem",
                        borderRadius: "6px",
                        width: "100%",
                        textAlign: "center",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "4px",
                        borderColor: "var(--border)"
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                      {userProfile?.email?.endsWith("@flexpro.in") ? "Add Real Email" : "Update Email"}
                    </button>
                    {emailSuccess && (
                      <span style={{ fontSize: "0.7rem", color: "var(--emerald, #10b981)", fontWeight: "500", textAlign: "center" }}>
                        ✓ {emailSuccess}
                      </span>
                    )}
                  </>
                )}

                {isEditingContact ? (
                  <form onSubmit={handleUpdateContact} style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "4px" }}>
                    <input
                      type="tel"
                      placeholder="Enter 10-digit number..."
                      value={newContact}
                      onChange={(e) => setNewContact(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
                      required
                      style={{
                        padding: "6px 10px",
                        fontSize: "0.8rem",
                        borderRadius: "6px",
                        border: "1px solid var(--border, #e5e7eb)",
                        background: "var(--bg-base, #f9fafb)",
                        color: "var(--text-primary, #111827)",
                        width: "100%"
                      }}
                    />
                    {contactError && (
                      <span style={{ fontSize: "0.7rem", color: "var(--rose, #ef4444)", fontWeight: "500" }}>{contactError}</span>
                    )}
                    <div style={{ display: "flex", gap: "6px", marginTop: "2px" }}>
                      <button
                        type="button"
                        onClick={() => setIsEditingContact(false)}
                        className="btn btn-ghost"
                        style={{ padding: "4px 8px", fontSize: "0.75rem", borderRadius: "6px", flex: 1, borderColor: "var(--border)" }}
                        disabled={updatingContact}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="btn btn-primary"
                        style={{ padding: "4px 8px", fontSize: "0.75rem", borderRadius: "6px", flex: 1 }}
                        disabled={updatingContact}
                      >
                        {updatingContact ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setNewContact(userProfile?.contact || "");
                        setIsEditingContact(true);
                      }}
                      className="btn btn-ghost"
                      style={{
                        padding: "6px 10px",
                        fontSize: "0.75rem",
                        borderRadius: "6px",
                        width: "100%",
                        textAlign: "center",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "4px",
                        borderColor: "var(--border)",
                        marginTop: "4px"
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                      </svg>
                      Update Contact
                    </button>
                    {contactSuccess && (
                      <span style={{ fontSize: "0.7rem", color: "var(--emerald, #10b981)", fontWeight: "500", textAlign: "center" }}>
                        ✓ {contactSuccess}
                      </span>
                    )}
                  </>
                )}

                <hr style={{ border: "none", borderTop: "1px solid var(--border, #e5e7eb)", margin: "4px 0" }} />
                <button
                  onClick={handleLogout}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    width: "100%",
                    padding: "8px 12px",
                    background: "none",
                    border: "none",
                    color: "var(--rose, #ef4444)",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    borderRadius: "6px",
                    textAlign: "left"
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" x2="9" y1="12" y2="12" />
                  </svg>
                  Logout
                </button>
              </div>
            )}
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
