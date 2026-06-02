import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import { getGlobalStats, getAllGymOwners, getGymMembers, getAttendanceForMember } from "../firebase/firestore";

// ─── Local Member Stats Modal for Super-Admin ───────────────────────────
function MemberStatsModal({ member, onClose }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!member?.id) return;
    getAttendanceForMember(member.id)
      .then((data) => {
        setRecords(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error loading attendance history:", err);
        setLoading(false);
      });
  }, [member]);

  const planColors = {
    "1 Month": "linear-gradient(135deg,#2563eb,#4f46e5)",
    "3 Months": "linear-gradient(135deg,#4f46e5,#db2777)",
    "1 Year": "linear-gradient(135deg,#10b981,#0ea5e9)",
  };

  const statusColors = {
    active: "var(--emerald)",
    expired: "var(--rose)",
    soon: "var(--amber)",
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content" style={{ maxWidth: "520px" }}>
        <div className="modal-header" style={{ paddingBottom: "12px", borderBottom: "1px solid var(--border)" }}>
          <h2 className="modal-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: "var(--cyan)" }}>
              <line x1="18" y1="20" x2="18" y2="10"/>
              <line x1="12" y1="20" x2="12" y2="4"/>
              <line x1="6" y1="20" x2="6" y2="14"/>
            </svg>
            Member Stats & History
          </h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Member Profile */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px", margin: "20px 0", background: "var(--bg-surface)", padding: "16px", borderRadius: "12px" }}>
          <div className="member-avatar" style={{ background: planColors[member.plan] || planColors["1 Month"], width: "48px", height: "48px", fontSize: "1.1rem", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", color: "#fff", fontWeight: "bold" }}>
            {member.name?.trim().split(" ").slice(0,2).map(n => n[0]).join("").toUpperCase() || "M"}
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)" }}>{member.name}</h3>
            <p style={{ margin: "2px 0 0", fontSize: "0.85rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "4px" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: "var(--text-muted)" }}>
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
              {member.contact ? (
                <a href={`tel:${member.contact}`} style={{ color: "inherit", textDecoration: "underline" }}>
                  {member.contact}
                </a>
              ) : "—"}
            </p>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", flexDirection: "column", gap: "4px", alignItems: "flex-end" }}>
            <span className="badge badge-plan">{member.plan || "1 Month"}</span>
            <span className="badge" style={{ background: `${statusColors[member.status] || "var(--emerald)"}15`, color: statusColors[member.status] || "var(--emerald)" }}>
              {member.status?.toUpperCase() || "ACTIVE"}
            </span>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "24px" }}>
          <div>
            <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: "bold" }}>Start Date</span>
            <p style={{ margin: "4px 0 0", fontSize: "0.95rem", fontWeight: 500, color: "var(--text-primary)" }}>
              {member.startDate ? new Date(member.startDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
            </p>
          </div>
          <div>
            <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: "bold" }}>Expiry Date</span>
            <p style={{ margin: "4px 0 0", fontSize: "0.95rem", fontWeight: 500, color: "var(--text-primary)" }}>
              {member.endDate ? new Date(member.endDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
            </p>
          </div>
        </div>

        {/* Attendance logs list */}
        <h4 style={{ fontSize: "0.95rem", fontWeight: 700, marginBottom: "12px", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: "var(--cyan)" }}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          Attendance History ({records.length})
        </h4>
        
        <div style={{ maxHeight: "200px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px", paddingRight: "4px" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "20px" }}>
              <div className="spinner" style={{ width: 28, height: 28, margin: "0 auto" }} />
            </div>
          ) : records.length === 0 ? (
            <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem", padding: "20px" }}>No check-in history found.</p>
          ) : (
            records.map((r) => (
              <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: "var(--bg-base)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "0.85rem" }}>
                <span>{new Date(r.checkInTime).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}</span>
                <strong style={{ color: "var(--cyan)" }}>
                  {new Date(r.checkInTime).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}
                </strong>
              </div>
            ))
          )}
        </div>

        <div className="modal-actions" style={{ marginTop: "24px" }}>
          <button className="btn btn-primary" onClick={onClose} style={{ width: "100%" }}>Close Details</button>
        </div>
      </div>
    </div>
  );
}

// ─── Super Admin Dashboard ──────────────────────────────────────────────────
export default function SuperAdminPage() {
  const [stats, setStats] = useState({ totalGyms: 0, totalMembers: 0, todayAttendance: 0 });
  const [gyms, setGyms] = useState([]);
  const [activeGym, setActiveGym] = useState(null); // Gym Owner document currently inspected
  const [members, setMembers] = useState([]); // Members of selected gym
  const [activeMember, setActiveMember] = useState(null); // Member document currently inspected
  
  const [loading, setLoading] = useState(true);
  const [membersLoading, setMembersLoading] = useState(false);
  const [error, setError] = useState("");
  
  const [gymSearch, setGymSearch] = useState("");
  const [memberSearch, setMemberSearch] = useState("");

  const fetchData = async () => {
    setLoading(true);
    setError("");
    try {
      const [globalStats, allGyms] = await Promise.all([
        getGlobalStats(),
        getAllGymOwners()
      ]);
      setStats(globalStats);
      setGyms(allGyms);
    } catch (err) {
      console.error("Error fetching super-admin data:", err);
      setError("Failed to load platform statistics.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSelectGym = async (gym) => {
    setActiveGym(gym);
    setMembersLoading(true);
    setMemberSearch("");
    try {
      // Fetch members of selected gymowner
      const gymId = gym.gymId || gym.id;
      const data = await getGymMembers(gymId);
      setMembers(data);
    } catch (err) {
      console.error("Error fetching gym members:", err);
    } finally {
      setMembersLoading(false);
    }
  };

  const handleBackToGyms = () => {
    setActiveGym(null);
    setMembers([]);
    setMemberSearch("");
  };

  // Filter Gyms
  const filteredGyms = gyms.filter((g) =>
    g.gymName?.toLowerCase().includes(gymSearch.toLowerCase()) ||
    g.name?.toLowerCase().includes(gymSearch.toLowerCase()) ||
    g.gymAddress?.toLowerCase().includes(gymSearch.toLowerCase())
  );

  // Filter Members within selected gym
  const filteredMembers = members.filter((m) =>
    m.name?.toLowerCase().includes(memberSearch.toLowerCase()) ||
    m.contact?.includes(memberSearch) ||
    m.email?.toLowerCase().includes(memberSearch.toLowerCase())
  );

  const formatDate = (timestamp) => {
    if (!timestamp) return "—";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
  };

  return (
    <Layout title="Platform Overview" subtitle={activeGym ? `Gym Management ➔ ${activeGym.gymName}` : "Global administration and metrics dashboard"}>
      <div className="page-section" style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
        
        {error && <div className="auth-error">{error}</div>}

        {/* ─── State 1: Gyms Dashboard List ─── */}
        {!activeGym && (
          <>
            {/* Stats Grid */}
            <div className="stats-grid" style={{ padding: 0 }}>
              <div className="stat-card" style={{ "--accent": "var(--cyan)" }}>
                <span className="stat-icon" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><line x1="9" y1="22" x2="9" y2="16"/><line x1="15" y1="22" x2="15" y2="16"/><line x1="9" y1="16" x2="15" y2="16"/></svg>
                </span>
                <div className="stat-info">
                  <span className="stat-value">{loading ? "..." : stats.totalGyms}</span>
                  <span className="stat-label">Total Gyms</span>
                </div>
              </div>

              <div className="stat-card" style={{ "--accent": "var(--violet)" }}>
                <span className="stat-icon" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                </span>
                <div className="stat-info">
                  <span className="stat-value">{loading ? "..." : stats.totalMembers}</span>
                  <span className="stat-label">Total Members</span>
                </div>
              </div>

              <div className="stat-card" style={{ "--accent": "var(--emerald)" }}>
                <span className="stat-icon" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
                </span>
                <div className="stat-info">
                  <span className="stat-value">{loading ? "..." : stats.todayAttendance}</span>
                  <span className="stat-label">Today's Check-ins</span>
                </div>
              </div>
            </div>

            {/* Gyms Table Card */}
            <div className="table-card">
              <div className="table-header-wrap" style={{ flexWrap: "wrap", gap: "16px" }}>
                <h2 className="table-card-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: "var(--cyan)" }}><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><line x1="9" y1="22" x2="9" y2="16"/><line x1="15" y1="22" x2="15" y2="16"/><line x1="9" y1="16" x2="15" y2="16"/></svg>
                  Registered Gym Owners
                </h2>
                
                <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                  <div style={{ position: "relative", width: "260px" }}>
                    <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", display: "inline-flex", alignItems: "center", color: "var(--text-muted)" }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    </span>
                    <input
                      type="search"
                      className="search-input"
                      style={{ paddingLeft: "36px", width: "100%" }}
                      placeholder="Search owner name, gym..."
                      value={gymSearch}
                      onChange={(e) => setGymSearch(e.target.value)}
                    />
                  </div>
                  <button className="btn btn-ghost" onClick={fetchData} disabled={loading} style={{ padding: "8px 14px", fontSize: "0.85rem", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                    Refresh
                  </button>
                </div>
              </div>

              <div className="table-responsive">
                {loading ? (
                  <div style={{ padding: "40px", textAlign: "center" }}>
                    <div className="spinner" style={{ margin: "0 auto 16px" }} />
                    <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>Loading gym registry...</p>
                  </div>
                ) : filteredGyms.length === 0 ? (
                  <div className="table-empty" style={{ padding: "48px", textAlign: "center", color: "var(--text-muted)" }}>
                    <span style={{ fontSize: "2rem", display: "inline-flex", justifyContent: "center", alignItems: "center", marginBottom: "12px" }}>
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: "var(--text-muted)" }}><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><line x1="9" y1="22" x2="9" y2="16"/><line x1="15" y1="22" x2="15" y2="16"/></svg>
                    </span>
                    <p>{gymSearch ? `No search results for "${gymSearch}"` : "No registered gyms yet."}</p>
                  </div>
                ) : (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Gym Name</th>
                        <th>Owner Name</th>
                        <th>Location / Address</th>
                        <th>Email</th>
                        <th>Registered On</th>
                        <th style={{ textAlign: "right" }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredGyms.map((g) => (
                        <tr key={g.id}>
                          <td style={{ fontWeight: 700, color: "var(--cyan)" }}>{g.gymName || "Unnamed Gym"}</td>
                          <td style={{ fontWeight: 500 }}>{g.name}</td>
                          <td style={{ fontSize: "0.88rem", color: "var(--text-secondary)" }}>{g.gymAddress || "No location info"}</td>
                          <td>{g.email}</td>
                          <td>{formatDate(g.createdAt)}</td>
                          <td style={{ textAlign: "right" }}>
                            <button className="btn btn-primary" onClick={() => handleSelectGym(g)} style={{ padding: "6px 12px", fontSize: "0.8rem", borderRadius: "8px", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                              View Members
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        )}

        {/* ─── State 2: Gym Members List View ─── */}
        {activeGym && (
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            
            {/* Header / Nav Back Bar */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
              <button className="btn btn-ghost" onClick={handleBackToGyms} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 16px" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                Back to Gyms
              </button>
              
              <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                <div style={{ position: "relative", width: "260px" }}>
                  <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", display: "inline-flex", alignItems: "center", color: "var(--text-muted)" }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  </span>
                  <input
                    type="search"
                    className="search-input"
                    style={{ paddingLeft: "36px", width: "100%" }}
                    placeholder="Search members by name..."
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Gym Info Card */}
            <div className="gym-qr-card" style={{ background: "#ffffff", borderRadius: "16px", padding: "20px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
              <div>
                <h3 style={{ fontSize: "1.15rem", fontWeight: 800, color: "var(--cyan)", margin: 0, display: "flex", alignItems: "center", gap: "6px" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 21h18M3 10h18M9 21v-9M15 21v-9M4 10V3h16v7"/></svg>
                  {activeGym.gymName}
                </h3>
                <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "4px", display: "flex", alignItems: "center", gap: "6px" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: "var(--text-muted)" }}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  {activeGym.gymAddress}
                </p>
              </div>
              <div style={{ display: "flex", gap: "24px", alignItems: "center" }}>
                <div style={{ textAlign: "right" }}>
                  <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Owner</span>
                  <p style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)", margin: "2px 0 0" }}>{activeGym.name}</p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Total Members</span>
                  <p style={{ fontSize: "0.95rem", fontWeight: 800, color: "var(--cyan)", margin: "2px 0 0" }}>{members.length}</p>
                </div>
              </div>
            </div>

            {/* Members List Table Card */}
            <div className="table-card">
              <div className="table-header-wrap">
                <h2 className="table-card-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: "var(--cyan)" }}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                  Gym Members
                </h2>
              </div>

              <div className="table-responsive">
                {membersLoading ? (
                  <div style={{ padding: "40px", textAlign: "center" }}>
                    <div className="spinner" style={{ margin: "0 auto 16px" }} />
                    <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>Loading members...</p>
                  </div>
                ) : filteredMembers.length === 0 ? (
                  <div className="table-empty" style={{ padding: "48px", textAlign: "center", color: "var(--text-muted)" }}>
                    <span style={{ fontSize: "2rem", display: "inline-flex", justifyContent: "center", alignItems: "center", marginBottom: "12px" }}>
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: "var(--text-muted)" }}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                    </span>
                    <p>{memberSearch ? `No search results for "${memberSearch}"` : "No members registered in this gym yet."}</p>
                  </div>
                ) : (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Member Name</th>
                        <th>Contact Number</th>
                        <th>Email</th>
                        <th>Active Plan</th>
                        <th>Start Date</th>
                        <th>End Date</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMembers.map((m) => (
                        <tr key={m.id}>
                          <td style={{ fontWeight: 700 }}>
                            <button
                              onClick={() => setActiveMember(m)}
                              style={{ background: "none", border: "none", color: "var(--cyan)", fontWeight: 700, padding: 0, cursor: "pointer", textDecoration: "underline" }}
                            >
                              {m.name}
                            </button>
                          </td>
                          <td>
                            {m.contact ? (
                              <a href={`tel:${m.contact}`} style={{ color: "var(--cyan)", textDecoration: "underline" }}>
                                {m.contact}
                              </a>
                            ) : "—"}
                          </td>
                          <td>{m.email}</td>
                          <td><span className="badge badge-plan">{m.plan || "1 Month"}</span></td>
                          <td>{m.startDate ? formatDate(m.startDate) : "—"}</td>
                          <td>{m.endDate ? formatDate(m.endDate) : "—"}</td>
                          <td>
                            <span 
                              className="badge" 
                              style={{ 
                                background: m.status === "active" ? "rgba(16,185,129,0.12)" : "rgba(225,29,72,0.12)", 
                                color: m.status === "active" ? "var(--emerald)" : "var(--rose)" 
                              }}
                            >
                              {m.status?.toUpperCase() || "ACTIVE"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Member Details & History Modal */}
      {activeMember && (
        <MemberStatsModal
          member={activeMember}
          onClose={() => setActiveMember(null)}
        />
      )}
    </Layout>
  );
}
