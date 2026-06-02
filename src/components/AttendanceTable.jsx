import { useState, useEffect } from "react";
import { subscribeToAllAttendance } from "../firebase/firestore";
import { useAuth } from "../contexts/AuthContext";

function fmtDate(ts) {
  if (!ts) return "—";
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function fmtTime(ts) {
  if (!ts) return "—";
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
}

function initials(name = "") {
  return name.trim().split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
}

export default function AttendanceTable() {
  const { gymId } = useAuth();
  const [records, setRecords]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [dateFilter, setDateFilter] = useState("today"); // "today" | "week" | "month" | "all"

  useEffect(() => {
    if (!gymId) return;
    setLoading(true);
    const unsub = subscribeToAllAttendance(gymId, (data) => {
      setRecords(data);
      setLoading(false);
    });
    return () => unsub();
  }, [gymId]);

  // Client-side filtering logic
  const filteredRecords = records.filter((r) => {
    // 1. Search filter
    const matchesSearch =
      r.memberName?.toLowerCase().includes(search.toLowerCase()) ||
      r.memberContact?.includes(search);

    if (!matchesSearch) return false;

    // 2. Date filter
    const recordDate = new Date(r.checkInTime || r.createdAt?.toDate?.() || r.createdAt);
    const today = new Date();

    if (dateFilter === "today") {
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0);
      const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
      return recordDate >= todayStart && recordDate <= todayEnd;
    }

    if (dateFilter === "week") {
      const dayOfWeek = today.getDay();
      const diff = today.getDate() - dayOfWeek;
      const weekStart = new Date(today.getFullYear(), today.getMonth(), diff, 0, 0, 0, 0);
      const weekEnd = new Date(today.getFullYear(), today.getMonth(), diff + 6, 23, 59, 59, 999);
      return recordDate >= weekStart && recordDate <= weekEnd;
    }

    if (dateFilter === "month") {
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0, 0);
      const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
      return recordDate >= monthStart && recordDate <= monthEnd;
    }

    return true; // "all"
  });

  return (
    <div className="table-card">
      <style>{`
        .attendance-filter-bar {
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 16px;
          border-bottom: 1px solid var(--border);
          background: var(--bg-surface);
        }
        @media (min-width: 768px) {
          .attendance-filter-bar {
            flex-direction: row;
            align-items: center;
            justify-content: space-between;
          }
        }
        
        /* Mobile-First Table Styles */
        .a-table {
          width: 100%;
          border-collapse: collapse;
        }
        .a-thead {
          display: none; /* Hide headers on mobile */
        }
        .a-tbody tr {
          display: block;
          border-bottom: 1px solid var(--border);
          padding: 16px;
          background: var(--bg-card);
        }
        .a-tbody td {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 6px 0;
          font-size: 0.9rem;
          border: none;
        }
        .a-tbody td::before {
          content: attr(data-label);
          font-weight: 700;
          color: var(--text-secondary);
          font-size: 0.8rem;
          text-transform: uppercase;
        }
        
        /* Desktop overrides */
        @media (min-width: 768px) {
          .a-thead {
            display: table-header-group;
            background: var(--bg-surface);
          }
          .a-thead th {
            padding: 12px 16px;
            text-align: left;
            font-size: 0.78rem;
            font-weight: 700;
            color: var(--text-secondary);
            text-transform: uppercase;
            border-bottom: 1px solid var(--border);
          }
          .a-tbody tr {
            display: table-row;
            padding: 0;
          }
          .a-tbody tr:hover {
            background: rgba(0, 0, 0, 0.01);
          }
          .a-tbody td {
            display: table-cell;
            padding: 14px 16px;
            border-bottom: 1px solid var(--border);
          }
          .a-tbody td::before {
            display: none;
          }
        }
      `}</style>

      {/* Header and Filter Toolbar */}
      <div className="attendance-filter-bar">
        <h3 className="table-card-title" style={{ margin: 0 }}>Recent Check-Ins</h3>
        
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", width: "100%", maxWidth: "550px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", width: "100%" }}>
            <div style={{ position: "relative", flex: 1 }}>
              <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", display: "inline-flex", alignItems: "center", color: "var(--text-muted)" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              </span>
              <input
                type="search"
                className="payments-search-input"
                style={{ paddingLeft: "36px", width: "100%", height: "38px", maxWidth: "none" }}
                placeholder="Search member name or phone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            
            <select
              className="payments-select"
              style={{ height: "38px", padding: "8px 12px", flex: 1, minWidth: "140px" }}
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            >
              <option value="today">Today's Check-ins</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="all">All History</option>
            </select>
          </div>
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table className="a-table">
          <thead className="a-thead">
            <tr>
              <th>Member Name</th>
              <th>Date</th>
              <th>Time</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody className="a-tbody">
            {loading ? (
              <tr>
                <td colSpan="4" style={{ textAlign: "center", padding: "40px" }}>
                  <div className="table-loading" style={{ display: "flex", justifyContent: "center" }}>
                    <div className="spinner" style={{ width: 24, height: 24, borderWidth: 3 }} />
                  </div>
                </td>
              </tr>
            ) : filteredRecords.length === 0 ? (
              <tr>
                <td colSpan="4" style={{ textAlign: "center", padding: "40px" }}>
                  <div className="empty-state table-empty" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
                    <span className="empty-icon" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: "var(--text-muted)" }}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    </span>
                    <p style={{ color: "var(--text-muted)", margin: 0 }}>No check-in records match your filters.</p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredRecords.map((r, i) => {
                const colorId = i % 5;
                const colors = ["#2563eb", "#4f46e5", "#10b981", "#f59e0b", "#e11d48"];
                return (
                  <tr key={r.id}>
                    <td data-label="Member Name">
                      <div className="td-member">
                        <div className="td-avatar" style={{ background: `${colors[colorId]}22`, color: colors[colorId], border: `1px solid ${colors[colorId]}44` }}>
                          {initials(r.memberName)}
                        </div>
                        <div className="td-member-info">
                          <span className="td-name" style={{ fontWeight: 700, color: "var(--text-primary)" }}>{r.memberName}</span>
                          <span className="td-sub" style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>ID: {r.memberId?.slice(0, 6).toUpperCase()}</span>
                        </div>
                      </div>
                    </td>
                    <td className="td-date" data-label="Date" style={{ color: "var(--text-primary)" }}>{fmtDate(r.checkInTime || r.createdAt)}</td>
                    <td className="td-time" data-label="Time" style={{ color: "var(--text-primary)" }}>{fmtTime(r.checkInTime || r.createdAt)}</td>
                    <td data-label="Source">
                      {r.source === "member_self_scan" ? (
                        <span className="badge" style={{ background: "rgba(34,211,238,0.15)", color: "var(--cyan)", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
                          QR Scan
                        </span>
                      ) : (
                        <span className="badge" style={{ background: "rgba(167,139,250,0.15)", color: "var(--violet)", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                          Admin
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
