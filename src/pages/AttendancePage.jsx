import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import AttendanceTable from "../components/AttendanceTable";
import {
  subscribeToMembers,
  subscribeToTodayAttendance,
} from "../firebase/firestore";
import { useAuth } from "../contexts/AuthContext";

// ─── Attendance Page ──────────────────────────────────────────────────────────

export default function AttendancePage() {
  const { gymId } = useAuth();
  const [members,   setMembers]   = useState([]);
  const [history,   setHistory]   = useState([]);
  const [clock,     setClock]     = useState(new Date());

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Real-time members
  useEffect(() => {
    if (!gymId) return;
    const unsub = subscribeToMembers(gymId, setMembers);
    return () => unsub();
  }, [gymId]);

  // Real-time today's attendance for the top summary stats
  useEffect(() => {
    if (!gymId) return;
    const unsub = subscribeToTodayAttendance(gymId, setHistory);
    return () => unsub();
  }, [gymId]);

  const subtitle = clock.toLocaleTimeString("en-IN", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true,
  });

  return (
    <Layout title="Attendance" subtitle={`Live · ${subtitle}`}>
      <div className="page-section">

        {/* Summary chips (2x2 Grid) */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "16px", marginBottom: "24px" }}>
          {[
            { label: "CHECKED IN TODAY", value: history.length,               icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--emerald)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>, bg: "rgba(16,185,129,0.1)" },
            { label: "TOTAL MEMBERS",    value: members.length,               icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--cyan)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>, bg: "rgba(6,182,212,0.1)" },
            { label: "NOT YET IN",       value: Math.max(0, members.length - history.length), icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>, bg: "rgba(245,158,11,0.1)" },
            { label: "RATE TODAY",       value: members.length
              ? `${Math.round((history.length / members.length) * 100)}%`
              : "—",                                                           icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--violet)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>, bg: "rgba(139,92,246,0.1)" },
          ].map((s) => (
            <div key={s.label} style={{ background: "#ffffff", borderRadius: "16px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", padding: "16px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
              <div style={{ width: "42px", height: "42px", borderRadius: "50%", background: s.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem", marginBottom: "12px" }}>
                {s.icon}
              </div>
              <div style={{ fontSize: "1.75rem", fontWeight: "700", color: "#1f2937", lineHeight: "1" }}>{s.value}</div>
              <div style={{ fontSize: "0.75rem", color: "#6b7280", fontWeight: "600", textTransform: "uppercase", marginTop: "8px", letterSpacing: "0.05em" }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Check-ins data table */}
        <AttendanceTable />
        
      </div>
    </Layout>
  );
}
