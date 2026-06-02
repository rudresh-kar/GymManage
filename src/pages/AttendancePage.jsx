import { useState, useEffect, useRef, useCallback } from "react";
import Layout from "../components/Layout";
import AttendanceTable from "../components/AttendanceTable";
import {
  subscribeToMembers,
  subscribeToTodayAttendance,
  recordAttendance,
  checkAlreadyCheckedIn,
  getLocalDateKey,
} from "../firebase/firestore";
import { useAuth } from "../contexts/AuthContext";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(name = "") {
  return name.trim().split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
}

function fmtTime(ts) {
  if (!ts) return "—";
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
}

// ─── Check-In Search Panel ────────────────────────────────────────────────────

function CheckInPanel({ members }) {
  const [query, setQuery]         = useState("");
  const [results, setResults]     = useState([]);
  const [open, setOpen]           = useState(false);
  const [checking, setChecking]   = useState(null); // memberId being processed
  const [toast, setToast]         = useState(null); // { name, time }
  const inputRef                  = useRef(null);
  const wrapperRef                = useRef(null);

  // Filter members on query change
  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (!q) { setResults([]); setOpen(false); return; }
    const filtered = members.filter(
      (m) =>
        m.name?.toLowerCase().includes(q) ||
        m.contact?.replace(/\s/g, "").includes(q.replace(/\s/g, ""))
    );
    setResults(filtered.slice(0, 6));
    setOpen(true);
  }, [query, members]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Auto-dismiss toast after 4s
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleCheckIn = useCallback(async (member) => {
    if (checking) return;
    setChecking(member.id);
    setOpen(false);
    setQuery("");

    try {
      const alreadyIn = await checkAlreadyCheckedIn(member.id);
      if (alreadyIn) {
        setToast({ name: member.name, alreadyIn: true });
        setChecking(null);
        return;
      }

      const now = new Date();
      await recordAttendance({
        gymId: member.gymId,
        memberId: member.id,
        memberName: member.name,
        memberContact: member.contact || "",
        memberPlan: member.plan || "",
        dateKey: getLocalDateKey(now),
        checkInTime: now.toISOString(),
        source: "admin_manual_checkin",
      });

      setToast({ name: member.name, time: fmtTime(now), alreadyIn: false });
    } catch (err) {
      console.error("Check-in failed:", err);
    } finally {
      setChecking(null);
      inputRef.current?.focus();
    }
  }, [checking]);

  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div className="checkin-panel">
      <p className="checkin-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--cyan)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 22h-4v-4h-4v-4H6"/>
          <path d="M9 9l3-4h3"/>
          <path d="M5 12V8h4"/>
        </svg>
        Member Check-In
      </p>
      <p className="checkin-sub">Search by name or phone number · {today}</p>

      <div className="search-wrapper" ref={wrapperRef}>
        <input
          id="attendance-search"
          ref={inputRef}
          type="search"
          className="search-field"
          placeholder="Search member name or phone…"
          value={query}
          autoComplete="off"
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") { setOpen(false); setQuery(""); }
          }}
          aria-label="Search members for check-in"
          aria-expanded={open}
          aria-haspopup="listbox"
        />
        <span className="search-icon" aria-hidden="true" style={{ display: "inline-flex", alignItems: "center" }}>
          {checking ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ animation: "spin 1s linear infinite" }}><circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="32" /></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          )}
        </span>

        {/* Dropdown */}
        {open && (
          <div className="search-dropdown" role="listbox" aria-label="Search results">
            {results.length === 0 ? (
              <div className="no-results">No members found for "{query}"</div>
            ) : (
              results.map((m) => {
                const isProcessing = checking === m.id;
                return (
                  <div
                    key={m.id}
                    id={`checkin-result-${m.id}`}
                    className="search-result-item"
                    role="option"
                    onClick={() => !isProcessing && handleCheckIn(m)}
                    aria-label={`Check in ${m.name}`}
                  >
                    <div className="result-avatar" aria-hidden="true">
                      {initials(m.name)}
                    </div>
                    <div className="result-info">
                      <div className="result-name">{m.name}</div>
                      <div className="result-meta" style={{ display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap" }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: "var(--text-muted)" }}>
                          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                        </svg>
                        {m.contact ? (
                          <a
                            href={`tel:${m.contact}`}
                            onClick={(e) => e.stopPropagation()}
                            style={{ color: "var(--cyan)", textDecoration: "underline" }}
                          >
                            {m.contact}
                          </a>
                        ) : "—"} · {m.plan} plan
                      </div>
                    </div>
                    <span className="result-action">
                      {isProcessing ? "Checking…" : "Check In ↵"}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Toast notification */}
      {toast && (
        <div className="checkin-toast" role="status" aria-live="polite">
          <span className="checkin-toast-icon" style={{ display: "inline-flex", alignItems: "center" }}>
            {toast.alreadyIn ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: "var(--amber)" }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: "var(--emerald)" }}><polyline points="20 6 9 17 4 12"/></svg>
            )}
          </span>
          <span>
            {toast.alreadyIn
              ? <><strong>{toast.name}</strong> has already checked in today.</>
              : <><strong>{toast.name}</strong> checked in at <strong>{toast.time}</strong> — welcome!</>
            }
          </span>
        </div>
      )}
    </div>
  );
}

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

        {/* Check-in panel */}
        <CheckInPanel members={members} />

        {/* Check-ins data table */}
        <AttendanceTable />
        
      </div>
    </Layout>
  );
}
