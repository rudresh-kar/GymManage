import { useState, useEffect } from "react";
import { subscribeToTodayAttendance, subscribeToAllAttendance } from "../firebase/firestore";
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
  const [activeTab, setActiveTab] = useState("today"); // "today" | "all"
  const [records, setRecords]     = useState([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    if (!gymId) return;
    setLoading(true);
    let unsub;
    if (activeTab === "today") {
      unsub = subscribeToTodayAttendance(gymId, (data) => {
        setRecords(data);
        setLoading(false);
      });
    } else {
      unsub = subscribeToAllAttendance(gymId, (data) => {
        setRecords(data);
        setLoading(false);
      });
    }
    return () => {
      if (unsub) unsub();
    };
  }, [activeTab, gymId]);

  return (
    <div className="table-card">
      <div className="table-header-wrap">
        <h3 className="table-card-title">Recent Check-Ins</h3>
        <div className="table-tabs">
          <button
            className={`table-tab ${activeTab === "today" ? "active" : ""}`}
            onClick={() => setActiveTab("today")}
          >
            Today's Check-ins
          </button>
          <button
            className={`table-tab ${activeTab === "all" ? "active" : ""}`}
            onClick={() => setActiveTab("all")}
          >
            All History
          </button>
        </div>
      </div>

      <div className="table-responsive">
        <table className="data-table">
          <thead>
            <tr>
              <th>Member Name</th>
              <th>Date</th>
              <th>Time</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="4">
                  <div className="table-loading">
                    <div className="spinner" style={{ width: 24, height: 24, borderWidth: 3 }} />
                  </div>
                </td>
              </tr>
            ) : records.length === 0 ? (
              <tr>
                <td colSpan="4">
                  <div className="empty-state table-empty">
                    <span className="empty-icon" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: "var(--text-muted)" }}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    </span>
                    <p>No check-in records found for this view.</p>
                  </div>
                </td>
              </tr>
            ) : (
              records.map((r, i) => {
                const colorId = i % 5;
                const colors = ["#2563eb", "#4f46e5", "#10b981", "#f59e0b", "#e11d48"];
                return (
                  <tr key={r.id}>
                    <td>
                      <div className="td-member">
                        <div className="td-avatar" style={{ background: `${colors[colorId]}22`, color: colors[colorId], border: `1px solid ${colors[colorId]}44` }}>
                          {initials(r.memberName)}
                        </div>
                        <div className="td-member-info">
                          <span className="td-name">{r.memberName}</span>
                          <span className="td-sub">ID: {r.memberId?.slice(0, 6).toUpperCase()}</span>
                        </div>
                      </div>
                    </td>
                    <td className="td-date">{fmtDate(r.checkInTime || r.createdAt)}</td>
                    <td className="td-time">{fmtTime(r.checkInTime || r.createdAt)}</td>
                    <td>
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
