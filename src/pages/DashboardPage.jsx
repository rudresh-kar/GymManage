import { useRef, useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { subscribeToMembers, updateDocument } from "../firebase/firestore";
import Layout from "../components/Layout";

// ─── Gym QR Code Section ──────────────────────────────────────────────────────
function GymQRSection() {
  const { gymId, userProfile } = useAuth();
  const qrPayload = JSON.stringify({ action: "check_in", gymId });
  const printRef = useRef(null);

  const handlePrint = () => {
    // Grab the rendered QR SVG from the DOM
    const qrSvgEl = printRef.current?.querySelector("svg");
    const qrSvgMarkup = qrSvgEl ? qrSvgEl.outerHTML : "";

    const gymName = userProfile?.gymName || "My Gym";
    const gymAddress = userProfile?.gymAddress || "";

    const win = window.open("", "_blank");
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${gymName} – Attendance QR Code</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap');
            * { box-sizing: border-box; margin: 0; padding: 0; }
            @page { size: A4 portrait; margin: 0; }
            body {
              font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              background: #fff;
              padding: 40px 20px;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .page {
              text-align: center;
              max-width: 520px;
              width: 100%;
              display: flex;
              flex-direction: column;
              align-items: center;
              gap: 12px;
            }
            .brand {
              font-size: 2.8rem;
              font-weight: 900;
              letter-spacing: -1.5px;
              color: #111;
            }
            .subtitle {
              font-size: 1.15rem;
              font-weight: 600;
              color: #555;
              margin-bottom: 20px;
            }
            .qr-wrap {
              border: 3px solid #222;
              border-radius: 20px;
              padding: 28px;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              background: #fff;
            }
            .qr-wrap svg {
              display: block;
              width: 260px;
              height: 260px;
            }
            .gym-name {
              font-size: 1.8rem;
              font-weight: 800;
              color: #111;
              margin-top: 16px;
            }
            .gym-address {
              font-size: 1.05rem;
              color: #555;
              max-width: 400px;
              line-height: 1.5;
            }
            .scan-instruction {
              margin-top: 20px;
              font-size: 1.15rem;
              font-weight: 600;
              color: #333;
              background: #f3f4f6;
              padding: 14px 28px;
              border-radius: 12px;
              border: 1.5px solid #e5e7eb;
            }
            .footer {
              margin-top: 28px;
              font-size: 0.75rem;
              color: #aaa;
              border-top: 1px solid #eee;
              padding-top: 16px;
              width: 100%;
            }
          </style>
        </head>
        <body>
          <div class="page">
            <div class="brand">FlexPro.in</div>
            <div class="subtitle">Gym Attendance Management</div>

            <div class="qr-wrap">
              ${qrSvgMarkup}
            </div>

            <div class="gym-name">${gymName}</div>
            ${gymAddress ? `<div class="gym-address">${gymAddress}</div>` : ""}

            <div class="scan-instruction">📱 Scan this QR code to mark your attendance</div>

            <div class="footer">Powered by FlexPro.in — Gym Attendance Management System</div>
          </div>
          <script>window.onload = () => { window.print(); window.close(); }</script>
        </body>
      </html>
    `);
    win.document.close();
  };

  const handleDownload = async () => {
    const qrSvgEl = printRef.current?.querySelector("svg");
    if (!qrSvgEl) return;

    const gymName = userProfile?.gymName || "My Gym";
    const gymAddress = userProfile?.gymAddress || "";

    // Canvas dimensions (2x for high-res)
    const scale = 2;
    const W = 600 * scale;
    const pad = 60 * scale;
    const qrSize = 260 * scale;

    // Pre-calculate text metrics to determine canvas height
    const canvas = document.createElement("canvas");
    canvas.width = W;
    const ctx = canvas.getContext("2d");

    // Font sizes (scaled)
    const brandFs = 36 * scale;
    const subtitleFs = 15 * scale;
    const gymNameFs = 24 * scale;
    const addressFs = 14 * scale;
    const instrFs = 15 * scale;
    const footerFs = 10 * scale;

    // Calculate dynamic height
    let y = pad;
    y += brandFs + 8 * scale;     // brand
    y += subtitleFs + 30 * scale;  // subtitle + gap
    y += qrSize + 20 * scale;     // QR + border padding
    y += gymNameFs + 12 * scale;   // gym name
    if (gymAddress) y += addressFs + 12 * scale; // address
    y += 24 * scale;               // gap
    y += instrFs + 28 * scale + 20 * scale; // instruction box
    y += 20 * scale;               // gap
    y += footerFs + pad;           // footer

    const H = y;
    canvas.height = H;

    // White background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);

    // Center helper
    const centerX = W / 2;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    let curY = pad;

    // Brand: FlexPro.in
    ctx.fillStyle = "#111111";
    ctx.font = `900 ${brandFs}px Inter, Segoe UI, system-ui, sans-serif`;
    ctx.fillText("FlexPro.in", centerX, curY);
    curY += brandFs + 8 * scale;

    // Subtitle
    ctx.fillStyle = "#555555";
    ctx.font = `600 ${subtitleFs}px Inter, Segoe UI, system-ui, sans-serif`;
    ctx.fillText("Gym Attendance Management", centerX, curY);
    curY += subtitleFs + 30 * scale;

    // QR Code — render SVG to canvas
    const svgData = new XMLSerializer().serializeToString(qrSvgEl);
    const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(svgBlob);

    const qrImg = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = svgUrl;
    });

    // QR border box
    const boxPad = 20 * scale;
    const boxSize = qrSize + boxPad * 2;
    const boxX = centerX - boxSize / 2;
    ctx.strokeStyle = "#222222";
    ctx.lineWidth = 3 * scale;
    ctx.beginPath();
    const r = 16 * scale;
    ctx.roundRect(boxX, curY, boxSize, boxSize, r);
    ctx.stroke();

    // QR image
    ctx.drawImage(qrImg, centerX - qrSize / 2, curY + boxPad, qrSize, qrSize);
    URL.revokeObjectURL(svgUrl);
    curY += boxSize + 20 * scale;

    // Gym Name
    ctx.fillStyle = "#111111";
    ctx.font = `800 ${gymNameFs}px Inter, Segoe UI, system-ui, sans-serif`;
    ctx.fillText(gymName, centerX, curY);
    curY += gymNameFs + 12 * scale;

    // Gym Address
    if (gymAddress) {
      ctx.fillStyle = "#555555";
      ctx.font = `400 ${addressFs}px Inter, Segoe UI, system-ui, sans-serif`;
      ctx.fillText(gymAddress, centerX, curY);
      curY += addressFs + 12 * scale;
    }

    curY += 24 * scale;

    // Scan instruction badge
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

    // Footer
    ctx.fillStyle = "#aaaaaa";
    ctx.font = `400 ${footerFs}px Inter, Segoe UI, system-ui, sans-serif`;
    ctx.fillText("Powered by FlexPro.in — Gym Attendance Management System", centerX, curY);

    // Download
    const link = document.createElement("a");
    link.download = `${gymName.replace(/\s+/g, "_")}_QR_Code.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  return (
    <section className="gym-qr-section" aria-labelledby="gym-qr-heading" style={{ display: "flex", flexDirection: "column", gap: "24px", maxWidth: "480px", margin: "0 auto", width: "100%" }}>
      {/* 1. Top: Title and Description */}
      <div className="gym-qr-header" style={{ display: "block", borderBottom: "none", paddingBottom: 0, marginBottom: 0, textAlign: "center" }}>
        <h2 id="gym-qr-heading" className="section-title" style={{ marginBottom: "8px" }}>📲 Gym Check-In QR Code</h2>
        <p style={{ fontSize: "0.84rem", color: "var(--text-muted)" }}>Print and stick this on the gym wall. Members scan it to mark attendance.</p>
      </div>

      {/* 2. Unified Card Container */}
      <div className="gym-qr-card" style={{ background: "#ffffff", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", borderRadius: "16px", padding: "24px", display: "flex", flexDirection: "column", gap: "24px", position: "relative" }}>
        <div className="gym-qr-glow" aria-hidden="true" />
        
        {/* Content to Print */}
        <div ref={printRef} style={{ position: "relative", zIndex: 1, textAlign: "center", display: "flex", flexDirection: "column", gap: "24px" }}>
          
          {/* Instructions */}
          <div>
            <p className="gym-qr-instruction" style={{ marginBottom: "16px", fontSize: "1.1rem", fontWeight: 700 }}>📱 Scan to Check In</p>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", textAlign: "left", maxWidth: "340px", margin: "0 auto" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "0.875rem", color: "#4b5563", lineHeight: 1.5 }}>
                <span style={{ flexShrink: 0, fontSize: "1.1rem" }}>📲</span>
                <span>Members open their FlexPro app and tap <strong>"Scan Wall QR to Check In"</strong>.</span>
              </div>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "0.875rem", color: "#4b5563", lineHeight: 1.5 }}>
                <span style={{ flexShrink: 0, fontSize: "1.1rem" }}>✅</span>
                <span>Attendance is logged automatically — no manual entry needed.</span>
              </div>
            </div>
          </div>

          {/* Middle: QR Code Image and Grey Badge */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div className="gym-qr-code-wrap" style={{ display: "inline-flex", background: "var(--bg-surface)", padding: "20px", borderRadius: "20px", border: "1px solid var(--border)", boxShadow: "0 4px 6px rgba(0,0,0,0.05)", margin: "0 auto" }}>
              <QRCodeSVG value={qrPayload} size={200} bgColor="#ffffff" fgColor="#000000" level="H" includeMargin={false} />
            </div>
            <div className="gym-qr-code-badge" style={{ margin: "0 auto" }}><span>Scan to Check In</span></div>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", gap: "12px", position: "relative", zIndex: 1 }}>
          <button id="print-qr-btn" className="btn btn-primary" onClick={handlePrint} style={{ flex: 1, padding: "12px", fontSize: "1rem" }}>🖨️ Print QR</button>
          <button id="download-qr-btn" className="btn btn-primary" onClick={handleDownload} style={{ flex: 1, padding: "12px", fontSize: "1rem", background: "linear-gradient(135deg, #10b981, #059669)" }}>📥 Download QR</button>
        </div>
      </div>

      {/* 4. Helper Text neatly centered below the main card */}
      <div style={{ textAlign: "center", color: "#6b7280", fontSize: "0.875rem", display: "flex", flexDirection: "column", gap: "4px" }}>
        <p>Print or download the QR poster for your gym.</p>
        <p>Stick the printout near the gym entrance or reception desk.</p>
      </div>
    </section>
  );
}

// ─── Plan Status Helper ────────────────────────────────────────────────────────
const PLAN_DAYS = { "1 Month": 30, "3 Months": 90, "1 Year": 365 };

function getMemberStatus(startDate, plan, endDate) {
  if (!startDate || !plan) return "Unknown";
  let end;
  if (endDate) {
    end = new Date(endDate);
  } else {
    end = new Date(startDate);
    end.setDate(end.getDate() + (PLAN_DAYS[plan] || 30));
  }
  if (isNaN(end.getTime())) return "Unknown";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const daysLeft = Math.ceil((end - today) / 86400000);
  if (daysLeft < 0) return "Expired";
  if (daysLeft <= 7) return "Expiring Soon";
  return "Active";
}

// ─── Dashboard Page ───────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user, userProfile, gymId } = useAuth();
  const [memberCount, setMemberCount] = useState(0);
  const [expiringCount, setExpiringCount] = useState(0);
  const [expiredCount, setExpiredCount] = useState(0);
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const [tempLat, setTempLat] = useState("");
  const [tempLng, setTempLng] = useState("");
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [isEditingPricing, setIsEditingPricing] = useState(false);
  const [tempPricing, setTempPricing] = useState({ "1 Month": "", "3 Months": "", "1 Year": "" });
  const [savingPricing, setSavingPricing] = useState(false);
  const navigate = useNavigate();

  const handleSaveLocation = async () => {
    const latNum = tempLat.trim() ? Number(tempLat) : null;
    const lngNum = tempLng.trim() ? Number(tempLng) : null;
    
    if ((latNum !== null && isNaN(latNum)) || (lngNum !== null && isNaN(lngNum))) {
      return alert("Please enter valid numeric values for coordinates.");
    }

    try {
      await updateDocument("users", gymId, {
        gymLat: latNum,
        gymLng: lngNum
      });
      setIsEditingLocation(false);
    } catch (err) {
      console.error("Error saving location:", err);
      alert("Failed to save location coordinates: " + err.message);
    }
  };

  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      return alert("Geolocation is not supported by your browser");
    }
    setDetectingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setTempLat(String(pos.coords.latitude.toFixed(6)));
        setTempLng(String(pos.coords.longitude.toFixed(6)));
        setDetectingLocation(false);
      },
      (err) => {
        console.error(err);
        alert("Failed to detect location: " + err.message);
        setDetectingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSavePricing = async () => {
    setSavingPricing(true);
    try {
      await updateDocument("users", gymId, {
        planPricing: {
          "1 Month": Number(tempPricing["1 Month"]) || 0,
          "3 Months": Number(tempPricing["3 Months"]) || 0,
          "1 Year": Number(tempPricing["1 Year"]) || 0,
        }
      });
      setIsEditingPricing(false);
    } catch (err) {
      console.error("Error saving pricing:", err);
      alert("Failed to save pricing: " + err.message);
    } finally {
      setSavingPricing(false);
    }
  };

  useEffect(() => {
    if (!gymId) return;
    const unsubscribe = subscribeToMembers(gymId, (members) => {
      setMemberCount(members.length);
      let exp = 0, expSoon = 0;
      members.forEach((m) => {
        const st = getMemberStatus(m.startDate, m.plan, m.endDate);
        if (st === "Expired") exp++;
        if (st === "Expiring Soon") expSoon++;
      });
      setExpiringCount(expSoon);
      setExpiredCount(exp);
    });
    return () => unsubscribe();
  }, [gymId]);

  const pricing = userProfile?.planPricing || {};

  return (
    <Layout title="Dashboard" subtitle={`Welcome back, ${userProfile?.name || user?.email}`}>
      <div className="page-section dashboard-grid">
        
        {/* Left Side: Profile and Stats Details */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <h3 className="section-title" style={{ margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: "var(--cyan)" }}>
              <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            Profile Details
          </h3>
          
          <div className="gym-qr-card" style={{ background: "#ffffff", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", borderRadius: "16px", padding: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: "bold" }}>Owner Name</span>
              <span style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)" }}>{userProfile?.name || "Gym Owner"}</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: "bold" }}>Email Address</span>
              <span style={{ fontSize: "1rem", color: "var(--text-secondary)" }}>{userProfile?.email || user?.email}</span>
            </div>

            <hr style={{ border: "none", borderTop: "1px solid var(--border)" }} />

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: "bold" }}>Gym Name</span>
              <span style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--cyan)" }}>{userProfile?.gymName || "My Gym"}</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: "bold" }}>Location / Address</span>
              <span style={{ fontSize: "0.95rem", color: "var(--text-secondary)" }}>{userProfile?.gymAddress || "Not specified"}</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: "bold" }}>Gym GPS Coordinates</span>
              {isEditingLocation ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "4px" }}>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <input
                      type="text"
                      placeholder="Latitude (e.g. 20.296)"
                      value={tempLat}
                      onChange={(e) => setTempLat(e.target.value)}
                      style={{
                        flex: 1,
                        padding: "8px 12px",
                        fontSize: "0.85rem",
                        borderRadius: "8px",
                        border: "1px solid var(--border)",
                        background: "var(--bg-surface)",
                        color: "var(--text-primary)",
                        outline: "none"
                      }}
                    />
                    <input
                      type="text"
                      placeholder="Longitude (e.g. 85.824)"
                      value={tempLng}
                      onChange={(e) => setTempLng(e.target.value)}
                      style={{
                        flex: 1,
                        padding: "8px 12px",
                        fontSize: "0.85rem",
                        borderRadius: "8px",
                        border: "1px solid var(--border)",
                        background: "var(--bg-surface)",
                        color: "var(--text-primary)",
                        outline: "none"
                      }}
                    />
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ flex: 1, padding: "8px 12px", fontSize: "0.8rem", borderRadius: "8px", background: "var(--bg-surface)" }}
                      onClick={handleDetectLocation}
                      disabled={detectingLocation}
                    >
                      {detectingLocation ? "Detecting..." : "📍 Pin Current Location"}
                    </button>
                    <button
                      className="btn btn-primary"
                      style={{ padding: "8px 14px", fontSize: "0.8rem", borderRadius: "8px" }}
                      onClick={handleSaveLocation}
                    >
                      Save
                    </button>
                    <button
                      className="btn btn-ghost"
                      style={{ padding: "8px 14px", fontSize: "0.8rem", borderRadius: "8px" }}
                      onClick={() => setIsEditingLocation(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginTop: "2px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <span style={{ fontSize: "0.95rem", color: userProfile?.gymLat ? "var(--text-secondary)" : "var(--text-muted)", fontWeight: userProfile?.gymLat ? 600 : "normal" }}>
                      {userProfile?.gymLat && userProfile?.gymLng ? (
                        `🌐 ${userProfile.gymLat}, ${userProfile.gymLng}`
                      ) : "No location pinned (check-in geolocation validation is disabled)"}
                    </span>
                    {userProfile?.gymLat && userProfile?.gymLng && (
                      <span style={{ fontSize: "0.85rem" }}>
                        <a
                          href={`https://www.google.com/maps?q=${userProfile.gymLat},${userProfile.gymLng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "var(--cyan)", textDecoration: "underline", display: "inline-flex", alignItems: "center", gap: "4px" }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
                            <circle cx="12" cy="10" r="3"/>
                          </svg>
                          Open Google Maps Link
                        </a>
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setTempLat(userProfile?.gymLat ? String(userProfile.gymLat) : "");
                      setTempLng(userProfile?.gymLng ? String(userProfile.gymLng) : "");
                      setIsEditingLocation(true);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--cyan)",
                      fontSize: "0.8rem",
                      fontWeight: "600",
                      cursor: "pointer",
                      padding: 0
                    }}
                  >
                    {userProfile?.gymLat ? "Edit" : "Set Location"}
                  </button>
                </div>
              )}
            </div>

            <hr style={{ border: "none", borderTop: "1px solid var(--border)" }} />

            <div 
              onClick={() => navigate("/members")}
              style={{ display: "flex", alignItems: "center", gap: "16px", cursor: "pointer" }}
              title="View registered members"
            >
              <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: "rgba(37,99,235,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--cyan)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--text-primary)" }}>{memberCount}</span>
                <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", textTransform: "uppercase", textDecoration: "underline", textDecorationColor: "rgba(37,99,235,0.3)" }}>Total Registered Members</span>
              </div>
            </div>
          </div>

          {/* ── Plan Pricing Card ────────────────────────────────── */}
          <h3 className="section-title" style={{ margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: "var(--cyan)" }}>
              <line x1="12" x2="12" y1="2" y2="22"/>
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
            </svg>
            Plan Pricing
          </h3>
          <div className="gym-qr-card" style={{ background: "#ffffff", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", borderRadius: "16px", padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
            {isEditingPricing ? (
              <>
                {["1 Month", "3 Months", "1 Year"].map((plan) => (
                  <div key={plan} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                    <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "var(--text-primary)", minWidth: "90px" }}>{plan}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "4px", flex: 1 }}>
                      <span style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-muted)" }}>₹</span>
                      <input
                        type="number"
                        placeholder="e.g. 800"
                        value={tempPricing[plan]}
                        onChange={(e) => setTempPricing((p) => ({ ...p, [plan]: e.target.value }))}
                        style={{
                          flex: 1,
                          padding: "8px 12px",
                          fontSize: "0.9rem",
                          borderRadius: "8px",
                          border: "1px solid var(--border)",
                          background: "var(--bg-surface)",
                          color: "var(--text-primary)",
                          outline: "none",
                        }}
                      />
                    </div>
                  </div>
                ))}
                <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                  <button className="btn btn-primary" style={{ flex: 2, padding: "10px", fontSize: "0.85rem", borderRadius: "8px" }} onClick={handleSavePricing} disabled={savingPricing}>
                    {savingPricing ? "Saving…" : "Save Pricing"}
                  </button>
                  <button className="btn btn-ghost" style={{ flex: 1, padding: "10px", fontSize: "0.85rem", borderRadius: "8px" }} onClick={() => setIsEditingPricing(false)}>
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                {["1 Month", "3 Months", "1 Year"].map((plan) => (
                  <div key={plan} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--text-secondary)" }}>{plan}</span>
                    <span style={{ fontSize: "1.1rem", fontWeight: 800, color: pricing[plan] ? "var(--text-primary)" : "var(--text-muted)" }}>
                      {pricing[plan] ? `₹${pricing[plan].toLocaleString("en-IN")}` : "Not set"}
                    </span>
                  </div>
                ))}
                <button
                  onClick={() => {
                    setTempPricing({
                      "1 Month": pricing["1 Month"] || "",
                      "3 Months": pricing["3 Months"] || "",
                      "1 Year": pricing["1 Year"] || "",
                    });
                    setIsEditingPricing(true);
                  }}
                  className="btn btn-ghost"
                  style={{ padding: "8px 12px", fontSize: "0.82rem", borderRadius: "8px", marginTop: "4px", display: "inline-flex", alignItems: "center", gap: "4px" }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"/>
                  </svg>
                  {Object.values(pricing).some(Boolean) ? "Edit Pricing" : "Set Pricing"}
                </button>
              </>
            )}
          </div>

          {/* ── Membership Alerts Card ──────────────────────────── */}
          {(expiringCount > 0 || expiredCount > 0) && (
            <>
              <h3 className="section-title" style={{ margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: "var(--cyan)" }}>
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
                  <line x1="12" x2="12" y1="9" y2="13"/>
                  <line x1="12" x2="12.01" y1="17" y2="17"/>
                </svg>
                Membership Alerts
              </h3>
              <div className="gym-qr-card" style={{ background: "#ffffff", boxShadow: "0 1px 3px rgba(0,0,0,0.1)", borderRadius: "16px", padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
                {expiringCount > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px", background: "rgba(245,158,11,0.08)", borderRadius: "12px", border: "1px solid rgba(245,158,11,0.2)" }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="10"/>
                      <polyline points="12 6 12 12 16 14"/>
                    </svg>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#d97706" }}>{expiringCount}</div>
                      <div style={{ fontSize: "0.75rem", color: "#92400e", fontWeight: 600, textTransform: "uppercase" }}>Expiring in 7 days</div>
                    </div>
                  </div>
                )}
                {expiredCount > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px", background: "rgba(244,63,94,0.08)", borderRadius: "12px", border: "1px solid rgba(244,63,94,0.2)" }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#e11d48" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="15" x2="9" y1="9" y2="15"/>
                      <line x1="9" x2="15" y1="9" y2="15"/>
                    </svg>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#e11d48" }}>{expiredCount}</div>
                      <div style={{ fontSize: "0.75rem", color: "#9f1239", fontWeight: 600, textTransform: "uppercase" }}>Membership Expired</div>
                    </div>
                  </div>
                )}
                <button
                  onClick={() => navigate("/members")}
                  className="btn btn-ghost"
                  style={{ padding: "8px", fontSize: "0.82rem", borderRadius: "8px", textDecoration: "underline" }}
                >
                  View All Members →
                </button>
              </div>
            </>
          )}
        </div>

        {/* Right Side: QR Code Section */}
        <div>
          <GymQRSection />
        </div>

      </div>
    </Layout>
  );
}
