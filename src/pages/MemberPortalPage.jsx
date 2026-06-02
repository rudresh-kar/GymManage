import { useState, useEffect, useCallback, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "../contexts/AuthContext";
import { logoutUser } from "../firebase/auth";
import {
  getMember,
  subscribeToMemberAttendance,
  recordAttendance,
  checkAlreadyCheckedIn,
  getUserProfile,
  getLocalDateKey,
  getPaymentsForMemberPaginated,
  getAttendanceForMemberPaginated,
  updateMember,
  updateDocument,
} from "../firebase/firestore";
import { useNavigate } from "react-router-dom";
import QrScanner from "../components/QrScanner";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PLAN_DAYS = { "1 Month": 30, "3 Months": 90, "1 Year": 365 };

function getEndDate(startDate, plan) {
  if (!startDate || !plan) return null;
  const d = new Date(startDate);
  d.setDate(d.getDate() + (PLAN_DAYS[plan] || 30));
  return d;
}

function getMemberStatus(startDate, plan, endDate) {
  let end;
  if (endDate) {
    end = new Date(endDate);
  } else {
    end = getEndDate(startDate, plan);
  }
  if (!end || isNaN(end.getTime())) return { label: "Unknown", color: "var(--amber)" };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const daysLeft = Math.ceil((end - today) / 86400000);
  if (daysLeft < 0) return { label: "Expired", color: "var(--rose)", daysLeft };
  if (daysLeft <= 7) return { label: "Expiring Soon", color: "var(--amber)", daysLeft };
  return { label: "Active", color: "var(--emerald)", daysLeft };
}

function getHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // meters
  const phi1 = lat1 * Math.PI/180;
  const phi2 = lat2 * Math.PI/180;
  const deltaPhi = (lat2-lat1) * Math.PI/180;
  const deltaLambda = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(deltaPhi/2) * Math.sin(deltaPhi/2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda/2) * Math.sin(deltaLambda/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // distance in meters
}

function calculateMembershipUsed(startDate, endDateStr) {
  if (!startDate || !endDateStr) return 0;

  const start = new Date(startDate).getTime();
  const end = new Date(endDateStr).getTime();
  const current = new Date().getTime();

  if (current <= start) return 0;
  if (current >= end) return 100;

  const totalDuration = end - start;
  const elapsed = current - start;

  return Math.round((elapsed / totalDuration) * 100);
}

function fmt(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function fmtTime(ts) {
  if (!ts) return "—";
  const d = typeof ts === "string" ? new Date(ts) : ts?.toDate?.() || new Date(ts);
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function initials(name = "") {
  return name.trim().split(" ").slice(0, 2).map(w => w[0]?.toUpperCase()).join("");
}

// Helper to parse coordinates or place queries from Google Maps links, falling back to Gym Name + Address
const getMapsQuery = (mapLink, address, name) => {
  if (mapLink) {
    // Try extracting @lat,lng from URL
    const coordRegex = /@(-?\d+\.\d+),(-?\d+\.\d+)/;
    const match = mapLink.match(coordRegex);
    if (match) {
      return `${match[1]},${match[2]}`;
    }

    // Try extracting from ?q=lat,lng or &q=lat,lng
    const qParamRegex = /[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/;
    const qMatch = mapLink.match(qParamRegex);
    if (qMatch) {
      return `${qMatch[1]},${qMatch[2]}`;
    }

    // Try ll= parameter
    const llRegex = /[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/;
    const llMatch = mapLink.match(llRegex);
    if (llMatch) {
      return `${llMatch[1]},${llMatch[2]}`;
    }

    // Try /maps/place/Name/ pattern
    const placeRegex = /\/maps\/place\/([^/@]+)/;
    const placeMatch = mapLink.match(placeRegex);
    if (placeMatch) {
      try {
        return decodeURIComponent(placeMatch[1].replace(/\+/g, " "));
      } catch (e) {
        return placeMatch[1].replace(/\+/g, " ");
      }
    }

    // Try /dir/ pattern coordinates
    const dirRegex = /\/dir\/(-?\d+\.\d+),(-?\d+\.\d+)/;
    const dirMatch = mapLink.match(dirRegex);
    if (dirMatch) {
      return `${dirMatch[1]},${dirMatch[2]}`;
    }

    // Try !3d and !4d data attributes (Google Maps internal encoding)
    const data3dRegex = /!3d(-?\d+\.\d+)/;
    const data4dRegex = /!4d(-?\d+\.\d+)/;
    const lat3d = mapLink.match(data3dRegex);
    const lng4d = mapLink.match(data4dRegex);
    if (lat3d && lng4d) {
      return `${lat3d[1]},${lng4d[1]}`;
    }
  }

  if (address && name) {
    return `${name}, ${address}`;
  }
  return address || name || "";
};

// ─── Payment Summary Card ──────────────────────────────────────────────────────

function PaymentSummaryCard({ memberId }) {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [viewLevel, setViewLevel] = useState(0); // 0: 5 items, 1: 10 more, 2: all remaining

  const fetchPayments = useCallback(async (limitCount, cursor = null, isAppend = false) => {
    setLoading(true);
    try {
      const result = await getPaymentsForMemberPaginated(memberId, limitCount, cursor);
      if (isAppend) {
        setPayments(prev => [...prev, ...result.records]);
      } else {
        setPayments(result.records);
      }
      setLastDoc(result.lastDoc);
      setHasMore(result.hasMore);
    } catch (err) {
      console.error("Error fetching payments:", err);
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useEffect(() => {
    if (memberId) {
      fetchPayments(5, null, false);
    }
  }, [memberId, fetchPayments]);

  const handleLoadNext = async () => {
    if (viewLevel === 0) {
      await fetchPayments(10, lastDoc, true);
      setViewLevel(1);
    } else if (viewLevel === 1) {
      await fetchPayments(100, lastDoc, true);
      setViewLevel(2);
    }
  };

  const totalPaid = payments.reduce((sum, p) => sum + (p.amountPaid || 0), 0);
  const lastPayment = payments[0];
  const lastPaymentDate = lastPayment ? fmt(lastPayment.renewalDate || lastPayment.createdAt) : "—";
  const pendingDues = payments.reduce((sum, p) => sum + (p.dueAmount || 0), 0);

  return (
    <div style={{
      background: "var(--bg-card)",
      border: "1px solid var(--border)",
      borderRadius: "16px",
      padding: "20px",
      marginTop: "24px",
      boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
      width: "100%",
      display: "flex",
      flexDirection: "column",
      gap: "16px"
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <span style={{ fontSize: "1.2rem", display: "inline-flex", alignItems: "center", color: "var(--cyan)" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
        </span>
        <h4 style={{
          fontFamily: "var(--font-head)",
          fontSize: "1rem",
          fontWeight: 800,
          color: "var(--text-primary)",
          margin: 0
        }}>
          Payment Summary
        </h4>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", background: "var(--bg-surface)", padding: "14px", borderRadius: "12px" }}>
        <div>
          <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: "bold", textTransform: "uppercase" }}>Total Paid</span>
          <p style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--emerald)", margin: "2px 0 0" }}>₹{totalPaid.toLocaleString("en-IN")}</p>
        </div>
        <div>
          <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: "bold", textTransform: "uppercase" }}>Pending Dues</span>
          <p style={{ fontSize: "1.1rem", fontWeight: 800, color: pendingDues > 0 ? "var(--rose)" : "var(--emerald)", margin: "2px 0 0" }}>₹{pendingDues.toLocaleString("en-IN")}</p>
        </div>
        <div style={{ gridColumn: "span 2", borderTop: "1px solid var(--border)", paddingTop: "8px", marginTop: "4px" }}>
          <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: "bold", textTransform: "uppercase" }}>Last Payment Date</span>
          <p style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--text-primary)", margin: "2px 0 0" }}>{lastPaymentDate}</p>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "4px" }}>
        <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-secondary)" }}>Payment History</span>
        
        {loading && payments.length === 0 ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "10px" }}>
            <div className="spinner" style={{ width: "20px", height: "20px" }} />
          </div>
        ) : payments.length === 0 ? (
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: 0 }}>No payments recorded.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {payments.map((p) => (
              <div key={p.id} style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px",
                background: "var(--bg-base)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                fontSize: "0.85rem"
              }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{p.planType} Plan</span>
                  <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{fmt(p.renewalDate || p.createdAt)} ({p.paymentMethod})</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "2px" }}>
                  <span style={{ fontWeight: 800, color: "var(--text-primary)" }}>₹{(p.amountPaid || 0).toLocaleString("en-IN")}</span>
                  {p.dueAmount > 0 && (
                    <span style={{ fontSize: "0.7rem", color: "var(--rose)", fontWeight: 600 }}>Due: ₹{p.dueAmount.toLocaleString("en-IN")}</span>
                  )}
                </div>
              </div>
            ))}

            {hasMore && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={handleLoadNext}
                disabled={loading}
                style={{ padding: "6px", fontSize: "0.8rem", borderRadius: "8px", marginTop: "4px" }}
              >
                {loading ? "Loading..." : viewLevel === 0 ? "View More (10 more)" : "View All"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Profile Section ──────────────────────────────────────────────────────────

function ProfileSection({ member, onUpdate }) {
  const [showEditModal, setShowEditModal] = useState(false);
  if (!member) return <div className="portal-loading"><div className="spinner" /></div>;

  const status = getMemberStatus(member.startDate, member.plan, member.endDate);
  const endDate = member.endDate || getEndDate(member.startDate, member.plan)?.toISOString().split("T")[0];
  const progress = calculateMembershipUsed(member.startDate, endDate);
  const gymQrRef = useRef(null);

  const [resolvedMapQuery, setResolvedMapQuery] = useState("");

  const renderStatusBanner = () => {
    if (status.label === "Active") {
      return (
        <div style={{
          background: "rgba(16,185,129,0.08)",
          border: "1px solid rgba(16,185,129,0.2)",
          borderRadius: "16px",
          padding: "16px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          color: "var(--emerald)",
          fontWeight: "600",
          fontSize: "0.95rem",
          marginTop: "20px"
        }}>
          <span style={{ fontSize: "1.4rem", display: "inline-flex", alignItems: "center" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
          </span>
          <div>
            <div>Active Membership</div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: "normal", marginTop: "2px" }}>
              {status.daysLeft} days remaining in your plan.
            </div>
          </div>
        </div>
      );
    } else if (status.label === "Expiring Soon") {
      return (
        <div style={{
          background: "rgba(245,158,11,0.08)",
          border: "1px solid rgba(245,158,11,0.2)",
          borderRadius: "16px",
          padding: "16px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          color: "var(--amber)",
          fontWeight: "700",
          fontSize: "0.95rem",
          marginTop: "20px",
          animation: "pulse-amber 2s infinite"
        }}>
          <style>{`
            @keyframes pulse-amber {
              0% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.4); }
              70% { box-shadow: 0 0 0 8px rgba(245, 158, 11, 0); }
              100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); }
            }
          `}</style>
          <span style={{ fontSize: "1.4rem", display: "inline-flex", alignItems: "center" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </span>
          <div>
            <div>Membership Expiring Soon!</div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: "normal", marginTop: "2px" }}>
              Only {status.daysLeft} days left. Please visit the gym to renew.
            </div>
          </div>
        </div>
      );
    } else if (status.label === "Expired") {
      const daysOverdue = Math.abs(status.daysLeft);
      return (
        <div style={{
          background: "rgba(225,29,72,0.08)",
          border: "1px solid rgba(225,29,72,0.2)",
          borderRadius: "16px",
          padding: "16px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          color: "var(--rose)",
          fontWeight: "700",
          fontSize: "0.95rem",
          marginTop: "20px"
        }}>
          <span style={{ fontSize: "1.4rem", display: "inline-flex", alignItems: "center" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </span>
          <div>
            <div>Membership Expired!</div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: "normal", marginTop: "2px" }}>
              Expired {daysOverdue} {daysOverdue === 1 ? "day" : "days"} ago. Please renew your plan.
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  useEffect(() => {
    if (member?.gymLat && member?.gymLng) {
      setResolvedMapQuery(`${member.gymLat},${member.gymLng}`);
      return;
    }
    if (!member?.gymMapLink) return;
    
    // Set initial query as fallback
    const fallbackQuery = getMapsQuery(member.gymMapLink, member.gymAddress, member.gymName);
    setResolvedMapQuery(fallbackQuery);

    // If it's a short URL (maps.app.goo.gl or goo.gl), resolve it via CORS proxy
    if (member.gymMapLink.includes("maps.app.goo.gl") || member.gymMapLink.includes("goo.gl")) {
      const resolveViaProxy = async () => {
        // Try multiple CORS proxy services for reliability
        const proxies = [
          (url) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
          (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
        ];

        for (const makeProxyUrl of proxies) {
          try {
            const proxyUrl = makeProxyUrl(member.gymMapLink);
            const res = await fetch(proxyUrl);
            
            // allorigins returns { contents: "..." }, corsproxy returns raw HTML
            let html = "";
            const contentType = res.headers.get("content-type") || "";
            if (contentType.includes("application/json")) {
              const data = await res.json();
              html = data?.contents || "";
            } else {
              html = await res.text();
            }

            if (!html) continue;

            // Try to extract coordinates from the resolved page content
            // Method 1: og:url meta tag containing the full maps URL
            const ogUrlMatch = html.match(/property="og:url"\s+content="([^"]+)"|content="([^"]+)"\s+property="og:url"/);
            const longUrl = ogUrlMatch ? (ogUrlMatch[1] || ogUrlMatch[2]) : "";
            
            if (longUrl) {
              const query = getMapsQuery(longUrl, member.gymAddress, member.gymName);
              if (query) {
                setResolvedMapQuery(query);
                return; // Success, stop trying proxies
              }
            }

            // Method 2: Look for coordinates in staticmap URL
            const staticMapMatch = html.match(/staticmap\?center=([0-9.-]+)[,%]2C([0-9.-]+)/);
            if (staticMapMatch) {
              setResolvedMapQuery(`${staticMapMatch[1]},${staticMapMatch[2]}`);
              return;
            }

            // Method 3: Look for coordinates in the page using !3d/!4d data attributes
            const data3d = html.match(/!3d(-?\d+\.\d+)/);
            const data4d = html.match(/!4d(-?\d+\.\d+)/);
            if (data3d && data4d) {
              setResolvedMapQuery(`${data3d[1]},${data4d[1]}`);
              return;
            }

            // Method 4: Look for @lat,lng anywhere in the resolved content
            const coordInContent = html.match(/@(-?\d+\.\d{4,}),(-?\d+\.\d{4,})/);
            if (coordInContent) {
              setResolvedMapQuery(`${coordInContent[1]},${coordInContent[2]}`);
              return;
            }

            // Method 5: Look for ll= in any URL in the content
            const llInContent = html.match(/ll=(-?\d+\.\d+),(-?\d+\.\d+)/);
            if (llInContent) {
              setResolvedMapQuery(`${llInContent[1]},${llInContent[2]}`);
              return;
            }

            // Method 6: Look for place name in the page title or og:title
            const titleMatch = html.match(/<title>([^<]+)<\/title>/) || html.match(/og:title"\s+content="([^"]+)"/);
            if (titleMatch && titleMatch[1] && !titleMatch[1].includes("Google Maps")) {
              const placeName = titleMatch[1].replace(/ - Google Maps$/, "").trim();
              if (placeName.length > 3) {
                setResolvedMapQuery(placeName);
                return;
              }
            }
          } catch (err) {
            console.warn("Proxy failed, trying next:", err.message);
            continue;
          }
        }
      };

      resolveViaProxy();
    }
  }, [member?.gymMapLink, member?.gymAddress, member?.gymName]);

  const planColors = {
    "1 Month": "linear-gradient(135deg,#2563eb,#4f46e5)",
    "3 Months": "linear-gradient(135deg,#4f46e5,#db2777)",
    "1 Year": "linear-gradient(135deg,#10b981,#0ea5e9)",
  };

  const handleDownloadQR = async () => {
    const qrSvgEl = gymQrRef.current?.querySelector("svg");
    if (!qrSvgEl) return;

    const gymName = member.gymName || "My Gym";
    const gymAddress = member.gymAddress || "";

    const scale = 2;
    const W = 600 * scale;
    const pad = 60 * scale;
    const qrSize = 260 * scale;

    const canvas = document.createElement("canvas");
    canvas.width = W;
    const ctx = canvas.getContext("2d");

    const brandFs = 36 * scale;
    const subtitleFs = 15 * scale;
    const gymNameFs = 24 * scale;
    const addressFs = 14 * scale;
    const instrFs = 15 * scale;
    const footerFs = 10 * scale;

    let y = pad;
    y += brandFs + 8 * scale;
    y += subtitleFs + 30 * scale;
    y += qrSize + 20 * scale;
    y += gymNameFs + 12 * scale;
    if (gymAddress) y += addressFs + 12 * scale;
    y += 24 * scale;
    y += instrFs + 28 * scale + 20 * scale;
    y += 20 * scale;
    y += footerFs + pad;

    const H = y;
    canvas.height = H;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);

    const centerX = W / 2;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    let curY = pad;

    ctx.fillStyle = "#111111";
    ctx.font = `900 ${brandFs}px Inter, Segoe UI, system-ui, sans-serif`;
    ctx.fillText("FlexPro.in", centerX, curY);
    curY += brandFs + 8 * scale;

    ctx.fillStyle = "#555555";
    ctx.font = `600 ${subtitleFs}px Inter, Segoe UI, system-ui, sans-serif`;
    ctx.fillText("Gym Attendance Management", centerX, curY);
    curY += subtitleFs + 30 * scale;

    const svgData = new XMLSerializer().serializeToString(qrSvgEl);
    const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(svgBlob);

    const qrImg = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = svgUrl;
    });

    const boxPad = 20 * scale;
    const boxSize = qrSize + boxPad * 2;
    const boxX = centerX - boxSize / 2;
    ctx.strokeStyle = "#222222";
    ctx.lineWidth = 3 * scale;
    ctx.beginPath();
    const r = 16 * scale;
    ctx.roundRect(boxX, curY, boxSize, boxSize, r);
    ctx.stroke();

    ctx.drawImage(qrImg, centerX - qrSize / 2, curY + boxPad, qrSize, qrSize);
    URL.revokeObjectURL(svgUrl);
    curY += boxSize + 20 * scale;

    ctx.fillStyle = "#111111";
    ctx.font = `800 ${gymNameFs}px Inter, Segoe UI, system-ui, sans-serif`;
    ctx.fillText(gymName, centerX, curY);
    curY += gymNameFs + 12 * scale;

    if (gymAddress) {
      ctx.fillStyle = "#555555";
      ctx.font = `400 ${addressFs}px Inter, Segoe UI, system-ui, sans-serif`;
      ctx.fillText(gymAddress, centerX, curY);
      curY += addressFs + 12 * scale;
    }

    curY += 24 * scale;

    const instrText = "📱 Scan this QR code to mark your attendance";
    ctx.font = `600 ${instrFs}px Inter, Segoe UI, system-ui, sans-serif`;
    const instrMetrics = ctx.measureText(instrText);
    const instrBoxW = instrMetrics.width + 40 * scale;
    const instrBoxH = instrFs + 28 * scale;
    const instrBoxX = centerX - instrBoxW / 2;

    ctx.fillStyle = "#f3f4f6";
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1.5 * scale;
    ctx.beginPath();
    ctx.roundRect(instrBoxX, curY, instrBoxW, instrBoxH, 10 * scale);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#333333";
    ctx.fillText(instrText, centerX, curY + 14 * scale);
    curY += instrBoxH + 20 * scale;

    ctx.fillStyle = "#aaaaaa";
    ctx.font = `400 ${footerFs}px Inter, Segoe UI, system-ui, sans-serif`;
    ctx.fillText("Powered by FlexPro.in — Gym Attendance Management System", centerX, curY);

    const link = document.createElement("a");
    link.download = `${gymName.replace(/\s+/g, "_")}_QR_Code.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  return (
    <div className="portal-section">
      <div className="portal-profile-hero">
        <div className="portal-avatar-xl" style={{ background: planColors[member.plan] || planColors["1 Month"] }}>
          {initials(member.name)}
        </div>
        <h2 className="portal-member-name">{member.name}</h2>
        <p className="portal-member-contact" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", color: "var(--text-secondary)" }}>
          <span style={{ color: "#475569", display: "inline-flex", alignItems: "center" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
          </span>
          <span>
            {member.contact ? (
              <a href={`tel:${member.contact}`} style={{ color: "inherit", textDecoration: "underline" }}>
                {member.contact}
              </a>
            ) : "—"}
          </span>
        </p>
        <button
          className="btn btn-ghost"
          style={{
            marginTop: "12px",
            padding: "6px 14px",
            fontSize: "0.8rem",
            borderRadius: "20px",
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            background: "rgba(255, 255, 255, 0.05)",
            border: "1px solid var(--border)",
            cursor: "pointer",
          }}
          onClick={() => setShowEditModal(true)}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Edit Profile
        </button>
      </div>

      {/* Prominent Status Banner */}
      {renderStatusBanner()}

      {/* Subscription Details Card */}
      <div style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "16px",
        padding: "20px",
        marginTop: "24px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
        display: "flex",
        flexDirection: "column",
        gap: "16px"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ color: "var(--text-muted)", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Current Plan</div>
            <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "var(--text-primary)", marginTop: "4px" }}>{member.plan}</div>
          </div>
          <span className="badge" style={{ background: `${status.color}15`, color: status.color, border: `1px solid ${status.color}30`, padding: "6px 12px", fontSize: "0.85rem" }}>
            {status.label}
          </span>
        </div>

        <div style={{ height: "1px", background: "var(--border)" }} />

        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div>
            <div style={{ color: "var(--text-muted)", fontSize: "0.8rem", fontWeight: 600 }}>Start Date</div>
            <div style={{ fontSize: "1rem", color: "var(--text-primary)", marginTop: "2px", fontWeight: 700 }}>{fmt(member.startDate)}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ color: "var(--text-muted)", fontSize: "0.8rem", fontWeight: 600 }}>Expiry Date</div>
            <div style={{ fontSize: "1rem", color: "var(--text-primary)", marginTop: "2px", fontWeight: 700 }}>{fmt(endDate)}</div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "1rem", marginTop: "16px" }}>
        {[
          {
            label: "CONTACT",
            value: member.contact ? (
              <a href={`tel:${member.contact}`} style={{ color: "var(--cyan)", textDecoration: "underline" }}>
                {member.contact}
              </a>
            ) : "—"
          },
          { label: "MEMBERSHIP ID", value: member.id?.slice(0, 8).toUpperCase() + "…" },
          { label: "EMAIL", value: member.email || "—", fullWidth: true },
        ].map(({ label, value, fullWidth }) => (
          <div key={label} className="portal-info-cell" style={{ gridColumn: fullWidth ? "span 2 / span 2" : undefined }}>
            <span className="portal-info-label">{label}</span>
            <span className="portal-info-value" style={{ wordBreak: "break-all" }}>{value}</span>
          </div>
        ))}
      </div>

      <div className="portal-progress-wrap" style={{ display: "flex", flexDirection: "column", marginTop: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Membership Used</span>
          <span style={{ fontSize: "1rem", fontWeight: 800, color: "var(--text-primary)" }}>{progress}%</span>
        </div>
        <div className="portal-progress-track" style={{ width: "100%", margin: "12px 0" }}>
          <div className="portal-progress-fill" style={{ width: `${progress}%`, background: planColors[member.plan] || planColors["1 Month"] }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 500 }}>
          <span>{fmt(member.startDate)}</span>
          <span>{fmt(endDate)}</span>
        </div>
      </div>

      {/* Registered Gym Details & QR Card */}
      <div style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: "16px",
        padding: "20px",
        marginTop: "24px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        alignItems: "center"
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "4px", width: "100%", textAlign: "left" }}>
          <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: "bold", letterSpacing: "0.05em" }}>Registered Gym</span>
          <span style={{ fontSize: "1.15rem", fontWeight: 800, color: "var(--cyan)", display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 21h18M3 10h18M9 21v-9M15 21v-9M4 10V3h16v7"/><path d="M12 10v0"/></svg>
            {member.gymName || "Titan Gym"}
          </span>
          <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "6px", marginTop: "4px" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: "var(--text-muted)", flexShrink: 0 }}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            {member.gymAddress || "Location not specified"}
          </span>
        </div>
      </div>

      {(member.gymMapLink || (member.gymLat && member.gymLng)) && (
        <div style={{
          position: "relative",
          width: "100%",
          height: "280px",
          borderRadius: "16px",
          overflow: "hidden",
          border: "1px solid var(--border)",
          marginTop: "20px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.05)"
        }}>
          {/* Map Iframe in the background */}
          <iframe
            title="Gym Location Map"
            src={member.gymLat && member.gymLng 
              ? `https://maps.google.com/maps?q=${member.gymLat},${member.gymLng}&t=k&z=17&ie=UTF8&iwloc=&output=embed`
              : `https://maps.google.com/maps?q=${encodeURIComponent(resolvedMapQuery)}&t=k&z=17&ie=UTF8&iwloc=&output=embed`
            }
            style={{
              border: 0,
              width: "100%",
              height: "100%",
              position: "absolute",
              top: 0,
              left: 0,
              zIndex: 1
            }}
            allowFullScreen=""
            loading="lazy"
          />

          {/* Glassmorphic Overlay Panel at the bottom */}
          <div style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            background: "rgba(255, 255, 255, 0.85)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            borderTop: "1px solid rgba(255, 255, 255, 0.4)",
            padding: "16px",
            zIndex: 2,
            display: "flex",
            flexDirection: "column",
            gap: "10px"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
              <div style={{ textAlign: "left" }}>
                <h4 style={{
                  fontFamily: "var(--font-head)",
                  fontSize: "0.95rem",
                  fontWeight: 800,
                  color: "#0f172a",
                  margin: 0
                }}>
                  Google Map Location
                </h4>
                <p style={{
                  fontSize: "0.78rem",
                  color: "#475569",
                  margin: "2px 0 0",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: "200px"
                }}>
                  {member.gymName || "Gym Location"}
                </p>
              </div>
              
              {/* Open in Google Maps Button */}
              <a
                href={member.gymLat && member.gymLng
                  ? `https://www.google.com/maps?q=${member.gymLat},${member.gymLng}`
                  : member.gymMapLink
                }
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary"
                style={{
                  padding: "6px 14px",
                  fontSize: "0.76rem",
                  borderRadius: "8px",
                  background: "linear-gradient(135deg, var(--cyan), var(--violet))",
                  color: "#fff",
                  fontWeight: "600",
                  whiteSpace: "nowrap"
                }}
              >
                Open Maps ↗
              </a>
            </div>
          </div>
        </div>
      )}
      {showEditModal && (
        <EditProfileModal
          member={member}
          onClose={() => setShowEditModal(false)}
          onSaved={onUpdate}
        />
      )}
    </div>
  );
}

// ─── Edit Profile Modal ────────────────────────────────────────────────────────
function EditProfileModal({ member, onClose, onSaved }) {
  const [name, setName] = useState(member.name || "");
  const [contact, setContact] = useState(member.contact || "");
  const [email, setEmail] = useState(member.email || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return setError("Name is required");
    if (!contact.trim()) return setError("Contact number is required");

    setSaving(true);
    setError("");
    try {
      await updateMember(member.id, {
        name: name.trim(),
        contact: contact.trim(),
        email: email.trim()
      });

      if (member.uid) {
        await updateDocument("users", member.uid, {
          name: name.trim(),
          contact: contact.trim(),
          email: email.trim()
        });
      }
      onSaved({
        ...member,
        name: name.trim(),
        contact: contact.trim(),
        email: email.trim()
      });
      onClose();
    } catch (err) {
      console.error(err);
      setError("Failed to update profile: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content" style={{ maxWidth: "400px" }}>
        <div className="modal-header">
          <h2 className="modal-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: "var(--cyan)" }}>
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Edit Profile Details
          </h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {error && (
          <div className="auth-error" style={{ marginBottom: "18px" }}>{error}</div>
        )}

        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="edit-member-name">Full Name</label>
            <input
              id="edit-member-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="edit-member-contact">Contact Number</label>
            <input
              id="edit-member-contact"
              type="tel"
              required
              value={contact}
              onChange={(e) => setContact(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="edit-member-email">Email Address</label>
            <input
              id="edit-member-email"
              type="email"
              placeholder="e.g. member@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="modal-actions" style={{ marginTop: "20px" }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ flex: 2 }} disabled={saving}>
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Check-In via Wall QR ──────────────────────────────────────────────────────

const CHECKIN_STATES = {
  IDLE: "idle",
  SCANNING: "scanning",
  PROCESSING: "processing",
  SUCCESS: "success",
  DUPLICATE: "duplicate",
  ERROR: "error",
  INVALID: "invalid",
};

function CheckInSection({ member }) {
  const [scanState, setScanState] = useState(CHECKIN_STATES.IDLE);
  const [scanTime, setScanTime] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  const handleOpenScanner = () => setScanState(CHECKIN_STATES.SCANNING);
  const handleCloseScanner = () => {
    if (scanState === CHECKIN_STATES.SCANNING) setScanState(CHECKIN_STATES.IDLE);
  };

  const handleScan = useCallback(async (text) => {
    setScanState(CHECKIN_STATES.PROCESSING);

    if (!member) {
      setScanState(CHECKIN_STATES.ERROR);
      setErrorMsg("Member profile not loaded. Please try again.");
      return;
    }

    // 1. Validate the code and verify gym isolation
    try {
      const payload = JSON.parse(text.trim());
      if (payload.action !== "check_in" || payload.gymId !== member.gymId) {
        setScanState(CHECKIN_STATES.INVALID);
        return;
      }
    } catch (e) {
      setScanState(CHECKIN_STATES.INVALID);
      return;
    }

    // 2. Geolocation verification (if gym coordinates are configured)
    if (member.gymLat && member.gymLng) {
      try {
        const coords = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve(pos.coords),
            (err) => reject(err),
            { enableHighAccuracy: true, timeout: 8000 }
          );
        });

        const dist = getHaversineDistance(
          coords.latitude,
          coords.longitude,
          member.gymLat,
          member.gymLng
        );

        if (dist > 100) {
          setErrorMsg(`Location check failed: You are too far from the gym (${Math.round(dist)}m away). Please check in inside the gym.`);
          setScanState(CHECKIN_STATES.ERROR);
          return;
        }
      } catch (err) {
        console.error("Location lookup failed:", err);
        setErrorMsg("Location check failed: Geolocation access is required to check in at this gym.");
        setScanState(CHECKIN_STATES.ERROR);
        return;
      }
    }

    try {
      // 2. Duplicate check
      const alreadyIn = await checkAlreadyCheckedIn(member.id);
      if (alreadyIn) {
        setScanState(CHECKIN_STATES.DUPLICATE);
        return;
      }

      // 3. Record attendance
      const now = new Date();
      await recordAttendance({
        gymId: member.gymId,
        memberId: member.id,
        memberName: member.name,
        memberContact: member.contact || "",
        memberPlan: member.plan || "",
        dateKey: getLocalDateKey(now),
        checkInTime: now.toISOString(),
        source: "member_self_scan",
      });

      setScanTime(now);
      setScanState(CHECKIN_STATES.SUCCESS);
    } catch (err) {
      console.error("Check-in error:", err);
      setErrorMsg("Failed to record attendance. Please try again.");
      setScanState(CHECKIN_STATES.ERROR);
    }
  }, [member]);

  const reset = () => {
    setScanState(CHECKIN_STATES.IDLE);
    setErrorMsg("");
    setScanTime(null);
  };

  // ── Render: state machine ──
  return (
    <div className="portal-section">

      {/* ── IDLE ── */}
      {scanState === CHECKIN_STATES.IDLE && (
        <div className="checkin-idle-card">
          <div className="checkin-idle-icon" aria-hidden="true" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: "48px", color: "var(--cyan)" }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 7h3v3H7zM14 7h3v3h-3zM7 14h3v3H7zM14 14h1v1h-1zM17 14h1v1h-1zM17 17h1v1h-1zM14 17h1v1h-1z"/></svg>
          </div>
          <h4 className="checkin-idle-title">Ready to Check In?</h4>
          <p className="checkin-idle-sub">
            Find the <strong>FlexPro QR poster</strong> at the gym entrance and scan it.
          </p>
          <button
            id="scan-wall-qr-btn"
            className="checkin-scan-btn"
            onClick={handleOpenScanner}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
            Scan Wall QR to Check In
          </button>
          <p className="checkin-idle-note">Camera permission required</p>
        </div>
      )}

      {/* ── PROCESSING ── */}
      {scanState === CHECKIN_STATES.PROCESSING && (
        <div className="checkin-result-card checkin-processing">
          <div className="spinner" style={{ width: 48, height: 48, borderWidth: 4 }} />
          <p style={{ marginTop: "16px", color: "var(--text-secondary)" }}>Recording attendance…</p>
        </div>
      )}

      {/* ── SUCCESS ── */}
      {scanState === CHECKIN_STATES.SUCCESS && (
        <div className="lens-success-banner" role="status" aria-live="polite">
          <div className="lens-success-icon" aria-hidden="true" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <h4 className="lens-success-title">ATTENDANCE CONFIRMED!</h4>
          {scanTime && (
            <p className="lens-success-sub">
              Attendance recorded for {member?.name?.split(" ")[0]} on {scanTime.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.
            </p>
          )}
          <button className="lens-success-btn" onClick={reset}>
            Done
          </button>
        </div>
      )}

      {/* ── DUPLICATE ── */}
      {scanState === CHECKIN_STATES.DUPLICATE && (
        <div className="checkin-result-card checkin-duplicate" role="status">
          <span style={{ fontSize: "3rem", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--amber)" }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
          </span>
          <h4 style={{ fontFamily: "var(--font-head)", fontSize: "1.1rem", fontWeight: 800, color: "var(--amber)", marginTop: "14px" }}>
            Already Checked In Today!
          </h4>
          <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", marginTop: "6px" }}>
            You've already marked attendance for today. See you tomorrow!
          </p>
          <button className="btn btn-ghost" style={{ marginTop: "20px", width: "100%" }} onClick={reset}>
            OK
          </button>
        </div>
      )}

      {/* ── INVALID QR ── */}
      {scanState === CHECKIN_STATES.INVALID && (
        <div className="checkin-result-card checkin-error" role="alert">
          <span style={{ fontSize: "3rem", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--rose)" }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </span>
          <h4 style={{ fontFamily: "var(--font-head)", fontSize: "1.1rem", fontWeight: 800, color: "var(--rose)", marginTop: "14px" }}>
            Wrong QR Code
          </h4>
          <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", marginTop: "6px" }}>
            This QR code is not the official FlexPro gym check-in code. Please scan the poster on the gym wall.
          </p>
          <button className="btn btn-primary" style={{ marginTop: "20px", width: "100%" }} onClick={reset}>
            Try Again
          </button>
        </div>
      )}

      {/* ── ERROR ── */}
      {scanState === CHECKIN_STATES.ERROR && (
        <div className="checkin-result-card checkin-error" role="alert">
          <span style={{ fontSize: "3rem", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--rose)" }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </span>
          <h4 style={{ fontFamily: "var(--font-head)", fontSize: "1.1rem", fontWeight: 800, color: "var(--rose)", marginTop: "14px" }}>
            Check-In Failed
          </h4>
          <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", marginTop: "6px" }}>{errorMsg}</p>
          <button className="btn btn-primary" style={{ marginTop: "20px", width: "100%" }} onClick={reset}>
            Try Again
          </button>
        </div>
      )}

      {/* Camera scanner modal */}
      {scanState === CHECKIN_STATES.SCANNING && (
        <QrScanner onScan={handleScan} onClose={handleCloseScanner} />
      )}
    </div>
  );
}

// ─── Attendance History List ──────────────────────────────────────────────────

function AttendanceSection({ memberId }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [viewLevel, setViewLevel] = useState(0); // 0: 5 items, 1: 10 more, 2: all remaining

  const fetchAttendance = useCallback(async (limitCount, cursor = null, isAppend = false) => {
    setLoading(true);
    try {
      const result = await getAttendanceForMemberPaginated(memberId, limitCount, cursor);
      if (isAppend) {
        setRecords(prev => [...prev, ...result.records]);
      } else {
        setRecords(result.records);
      }
      setLastDoc(result.lastDoc);
      setHasMore(result.hasMore);
    } catch (err) {
      console.error("Error fetching attendance:", err);
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useEffect(() => {
    if (memberId) {
      fetchAttendance(5, null, false);
    }
  }, [memberId, fetchAttendance]);

  const handleLoadNext = async () => {
    if (viewLevel === 0) {
      await fetchAttendance(10, lastDoc, true);
      setViewLevel(1);
    } else if (viewLevel === 1) {
      await fetchAttendance(100, lastDoc, true);
      setViewLevel(2);
    }
  };

  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();

  const thisMonthCount = records.filter(r => {
    const d = new Date(r.dateKey || r.checkInTime);
    return d.getFullYear() === year && d.getMonth() === month;
  }).length;

  return (
    <div className="portal-section">
      <h3 className="portal-section-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: "var(--cyan)" }}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        Attendance History
      </h3>

      <div className="portal-stat-row">
        <div className="portal-mini-stat" style={{ "--c": "var(--cyan)" }}>
          <span className="portal-mini-val">{thisMonthCount}</span>
          <span className="portal-mini-label">This Month*</span>
        </div>
        <div className="portal-mini-stat" style={{ "--c": "var(--emerald)" }}>
          <span className="portal-mini-val">{records.length}</span>
          <span className="portal-mini-label">Loaded</span>
        </div>
        <div className="portal-mini-stat" style={{ "--c": "var(--violet)" }}>
          <span className="portal-mini-val">
            {records.filter(r => {
              const d = new Date(r.dateKey || r.checkInTime);
              const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
              return d >= weekAgo;
            }).length}
          </span>
          <span className="portal-mini-label">This Week*</span>
        </div>
      </div>
      <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "6px", fontStyle: "italic" }}>
        *Stats calculated based on currently loaded records. Click "View More" or "View All" below to load more history.
      </p>

      <div className="portal-history-list" style={{ marginTop: "24px", display: "flex", flexDirection: "column", gap: "12px" }}>
        {records.length === 0 && !loading ? (
          <div className="empty-state">
            <span className="empty-icon" style={{ fontSize: "2.5rem", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: "var(--text-muted)" }}><path d="M12 2v20M2 12h20M7 7l10 10M17 7l-10 10"/></svg>
            </span>
            <p style={{ marginTop: "12px", color: "var(--text-muted)", fontSize: "0.95rem" }}>No check-in history found yet.</p>
          </div>
        ) : (
          <>
            {records.map(r => (
              <div key={r.id} className="portal-log-card">
                <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                  <div style={{ width: "42px", height: "42px", borderRadius: "12px", background: "rgba(16,185,129,0.08)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--emerald)" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: "0.95rem" }}>
                      {new Date(r.checkInTime).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                    </div>
                    <div style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: "3px" }}>
                      Gym Check-In
                    </div>
                  </div>
                </div>
                <div style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: "0.9rem", padding: "6px 12px", background: "#f1f5f9", borderRadius: "8px" }}>
                  {fmtTime(r.checkInTime)}
                </div>
              </div>
            ))}
            
            {loading && (
              <div className="portal-loading"><div className="spinner" /></div>
            )}

            {hasMore && !loading && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={handleLoadNext}
                style={{ padding: "8px", fontSize: "0.85rem", borderRadius: "8px", marginTop: "8px", width: "100%" }}
              >
                {viewLevel === 0 ? "View More (10 more)" : "View All"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Tab Config ───────────────────────────────────────────────────────────────

const TABS = [
  { id: "profile", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>, label: "Profile" },
  { id: "checkin", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>, label: "Check In" },
  { id: "attendance", icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>, label: "History" },
];

// ─── Member Portal Page ───────────────────────────────────────────────────────

export default function MemberPortalPage() {
  const { user, userProfile } = useAuth();
  const navigate = useNavigate();
  const [member, setMember] = useState(null);
  const [activeTab, setActiveTab] = useState("profile");
  const [loading, setLoading] = useState(true);

  const memberId = userProfile?.memberId;

  useEffect(() => {
    if (!memberId) return;
    getMember(memberId).then(async (data) => {
      if (data && data.gymId) {
        try {
          const gymProfile = await getUserProfile(data.gymId);
          if (gymProfile) {
            data.gymName = gymProfile.gymName;
            data.gymAddress = gymProfile.gymAddress;
            data.gymMapLink = gymProfile.gymMapLink || "";
            data.gymLat = gymProfile.gymLat || null;
            data.gymLng = gymProfile.gymLng || null;
          }
        } catch (err) {
          console.error("Error loading gym profile details:", err);
        }
      }
      setMember(data);
      setLoading(false);
    });
  }, [memberId]);

  const handleLogout = async () => {
    await logoutUser();
    navigate("/login");
  };

  return (
    <div className="portal-layout">
      {/* Top bar */}
      <header className="portal-topbar">
        <div className="portal-topbar-logo">
          <span style={{ display: "inline-flex", alignItems: "center", color: "var(--cyan)" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6.5 6.5 11 11"/><path d="m21 21-1-1"/><path d="m3 3 1 1"/><path d="m18 22 4-4"/><path d="m2 6 4-4"/><path d="m3 10 7-7"/><path d="m14 21 7-7"/><path d="M6.5 12.5 12.5 6.5"/><path d="m11.5 17.5 6-6"/></svg>
          </span>
          <span className="portal-topbar-brand" style={{ marginLeft: "6px" }}>FlexPro</span>
        </div>
        <div className="portal-topbar-right">
          <span className="portal-topbar-name">{userProfile?.name || user?.email}</span>
          <button id="portal-logout" className="portal-logout-btn" onClick={handleLogout} aria-label="Sign out">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" x2="9" y1="12" y2="12" />
            </svg>
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="portal-content" id="portal-main">
        {loading && !member ? (
          <div className="portal-loading" style={{ paddingTop: "80px" }}><div className="spinner" /></div>
        ) : (
          <>
            {activeTab === "profile" && <ProfileSection member={member} onUpdate={setMember} />}
            {activeTab === "checkin" && <CheckInSection member={member} />}
            {activeTab === "attendance" && <AttendanceSection memberId={memberId} />}
          </>
        )}
      </main>

      {/* Bottom navigation */}
      <nav className="portal-bottomnav" aria-label="Member portal navigation">
        {TABS.map(tab => (
          <button
            key={tab.id}
            id={`portal-tab-${tab.id}`}
            className={`portal-nav-btn${activeTab === tab.id ? " active" : ""}${tab.id === "checkin" ? " portal-nav-checkin" : ""}`}
            onClick={() => {
              setActiveTab(tab.id);
              document.getElementById("portal-main")?.scrollTo(0, 0);
            }}
            aria-current={activeTab === tab.id ? "page" : undefined}
          >
            <span className="portal-nav-icon">{tab.icon}</span>
            <span className="portal-nav-label">{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
