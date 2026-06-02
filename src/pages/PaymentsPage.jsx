import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import { useAuth } from "../contexts/AuthContext";
import { subscribeToGymPayments, updateDocument } from "../firebase/firestore";
import { BRAND_NAME } from "../constants";
import { jsPDF } from "jspdf";

function fmt(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function displayDate(isoStr) {
  if (!isoStr) return "";
  const parts = isoStr.split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return isoStr;
}

export default function PaymentsPage() {
  const { gymId: currentAdminGymId, userProfile } = useAuth();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [collectingPayment, setCollectingPayment] = useState(null);

  // PDF Export States
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [downloadPreset, setDownloadPreset] = useState("this_month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [applyFilters, setApplyFilters] = useState(true);
  const [generating, setGenerating] = useState(false);

  const resolveRange = () => {
    const today = new Date();
    let start, end;
    
    if (downloadPreset === "this_month") {
      start = new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0, 0);
      end = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
    } else if (downloadPreset === "last_month") {
      start = new Date(today.getFullYear(), today.getMonth() - 1, 1, 0, 0, 0, 0);
      end = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999);
    } else if (downloadPreset === "last_3_months") {
      start = new Date(today.getFullYear(), today.getMonth() - 3, 1, 0, 0, 0, 0);
      end = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
    } else {
      if (customStart) {
        const parts = customStart.split("-");
        start = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 0, 0, 0, 0);
      } else {
        start = new Date(1970, 0, 1, 0, 0, 0, 0);
      }
      
      if (customEnd) {
        const parts = customEnd.split("-");
        end = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 23, 59, 59, 999);
      } else {
        end = new Date();
      }
    }
    return { start, end };
  };

  const handleDownloadPDF = async () => {
    setGenerating(true);
    try {
      const { start, end } = resolveRange();

      // 1. Filter payment records by range
      let recordsToExport = payments.filter((p) => {
        const pDate = new Date(p.renewalDate || p.createdAt?.toDate?.() || p.createdAt);
        return pDate >= start && pDate <= end;
      });

      // 2. Apply active table filters if toggle is checked
      if (applyFilters) {
        recordsToExport = recordsToExport.filter((p) => {
          const matchesSearch =
            p.memberName?.toLowerCase().includes(search.toLowerCase()) ||
            p.memberContact?.includes(search);

          const matchesMethod = methodFilter === "All" || p.paymentMethod === methodFilter;

          let matchesStatus = true;
          if (statusFilter === "Fully Paid") {
            matchesStatus = (p.dueAmount || 0) === 0;
          } else if (statusFilter === "Has Dues") {
            matchesStatus = (p.dueAmount || 0) > 0;
          }

          return matchesSearch && matchesMethod && matchesStatus;
        });
      }

      // Sort chronological (newest first like table)
      recordsToExport.sort((a, b) => {
        const da = new Date(a.renewalDate || a.createdAt?.toDate?.() || a.createdAt);
        const db = new Date(b.renewalDate || b.createdAt?.toDate?.() || b.createdAt);
        return db - da;
      });

      // 3. Generate PDF
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      
      const PRIMARY = [6, 182, 212];
      const TEXT_DARK = [31, 41, 55];
      const TEXT_MUTED = [107, 114, 128];
      const LIGHT_BG = [249, 250, 251];
      const BORDER = [229, 231, 235];
      const GREEN = [16, 185, 129];
      const RED = [244, 63, 94];

      const drawChrome = (pageNum, totalPages) => {
        doc.setFillColor(...PRIMARY);
        doc.rect(0, 0, pageWidth, 4, "F");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...TEXT_MUTED);
        doc.text(`Powered by ${BRAND_NAME}.in — Gym Management System`, 14, pageHeight - 10);
        doc.text(`Page ${pageNum} of ${totalPages}`, pageWidth - 14, pageHeight - 10, { align: "right" });
      };

      const totalPaid = recordsToExport.reduce((sum, p) => sum + (p.amountPaid || 0), 0);
      const totalDue = recordsToExport.reduce((sum, p) => sum + (p.dueAmount || 0), 0);
      const gymName = userProfile?.gymName || "Titan Gym";
      const gymAddress = userProfile?.gymAddress || "";

      let yPos = 20;

      // Page Title & Gym Branding Header
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(...TEXT_DARK);
      doc.text(gymName, 14, yPos);
      
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(...PRIMARY);
      doc.text(BRAND_NAME.toUpperCase(), pageWidth - 14, yPos, { align: "right" });
      
      yPos += 6;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...TEXT_MUTED);
      if (gymAddress) {
        doc.text(gymAddress, 14, yPos);
      }
      doc.text("TRANSACTION REPORT", pageWidth - 14, yPos, { align: "right" });
      
      yPos += 8;
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.5);
      doc.line(14, yPos, pageWidth - 14, yPos);

      yPos += 8;
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(...TEXT_DARK);
      const fmtShortDate = (d) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
      doc.text(`Report Period: ${fmtShortDate(start)} to ${fmtShortDate(end)}`, 14, yPos);
      
      const genDateStr = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
      doc.text(`Generated: ${genDateStr}`, pageWidth - 14, yPos, { align: "right" });

      yPos += 12;

      // Summary Cards Block
      const colW = (pageWidth - 28 - 12) / 3;
      
      doc.setFillColor(...LIGHT_BG);
      doc.setDrawColor(...BORDER);
      doc.rect(14, yPos, colW, 20, "FD");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...TEXT_MUTED);
      doc.text("TOTAL REVENUE", 18, yPos + 6);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(...GREEN);
      doc.text(`INR ${totalPaid.toLocaleString("en-IN")}`, 18, yPos + 14);

      const x2 = 14 + colW + 6;
      doc.setFillColor(...LIGHT_BG);
      doc.rect(x2, yPos, colW, 20, "FD");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...TEXT_MUTED);
      doc.text("PENDING DUES", x2 + 4, yPos + 6);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(...(totalDue > 0 ? RED : TEXT_DARK));
      doc.text(`INR ${totalDue.toLocaleString("en-IN")}`, x2 + 4, yPos + 14);

      const x3 = 14 + (colW * 2) + 12;
      doc.setFillColor(...LIGHT_BG);
      doc.rect(x3, yPos, colW, 20, "FD");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...TEXT_MUTED);
      doc.text("TOTAL BILLS", x3 + 4, yPos + 6);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(...PRIMARY);
      doc.text(`${recordsToExport.length} Bills`, x3 + 4, yPos + 14);

      yPos += 28;

      // Table Header
      doc.setFillColor(...PRIMARY);
      doc.rect(14, yPos, pageWidth - 28, 8, "F");
      
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(255, 255, 255);
      doc.text("Date", 16, yPos + 5.5);
      doc.text("Member Details", 42, yPos + 5.5);
      doc.text("Plan", 95, yPos + 5.5);
      doc.text("Method", 125, yPos + 5.5);
      doc.text("Paid", 152, yPos + 5.5);
      doc.text("Due", 178, yPos + 5.5);

      yPos += 8;

      // Group records into pages beforehand
      const pages = [[]];
      let simulatedY = yPos;
      
      recordsToExport.forEach((p) => {
        const availableHeight = pageHeight - 15 - simulatedY;
        if (availableHeight < 10) {
          pages.push([]);
          simulatedY = 38;
        }
        pages[pages.length - 1].push(p);
        simulatedY += 8;
      });

      const totalPages = pages.length;
      let currentY = yPos;

      // Draw first page
      pages[0].forEach((p, idx) => {
        if (idx % 2 === 1) {
          doc.setFillColor(243, 244, 246);
          doc.rect(14, currentY, pageWidth - 28, 8, "F");
        }
        
        doc.setTextColor(...TEXT_DARK);
        const pDateStr = fmt(p.renewalDate || p.createdAt?.toDate?.() || p.createdAt);
        doc.text(pDateStr, 16, currentY + 5.5);
        
        const truncatedName = p.memberName?.length > 22 ? p.memberName.slice(0, 20) + ".." : p.memberName;
        doc.text(`${truncatedName} (${p.memberContact})`, 42, currentY + 5.5);
        
        doc.text(p.planType || "—", 95, currentY + 5.5);
        doc.text(p.paymentMethod || "—", 125, currentY + 5.5);
        
        doc.setTextColor(...GREEN);
        doc.text(`INR ${p.amountPaid?.toLocaleString("en-IN") || 0}`, 152, currentY + 5.5);
        
        doc.setTextColor(...((p.dueAmount || 0) > 0 ? RED : TEXT_MUTED));
        doc.text(`INR ${p.dueAmount?.toLocaleString("en-IN") || 0}`, 178, currentY + 5.5);
        
        currentY += 8;
      });

      drawChrome(1, totalPages);

      // Draw subsequent pages
      for (let pIdx = 1; pIdx < totalPages; pIdx++) {
        doc.addPage();
        currentY = 38;

        doc.setFillColor(...PRIMARY);
        doc.rect(0, 0, pageWidth, 4, "F");

        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(...TEXT_DARK);
        doc.text("Transaction History Report (Continued)", 14, 20);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.text(`Period: ${fmtShortDate(start)} to ${fmtShortDate(end)}`, 14, 25);

        doc.setFillColor(...PRIMARY);
        doc.rect(14, 30, pageWidth - 28, 8, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(255, 255, 255);
        doc.text("Date", 16, 35.5);
        doc.text("Member Details", 42, 35.5);
        doc.text("Plan", 95, 35.5);
        doc.text("Method", 125, 35.5);
        doc.text("Paid", 152, 35.5);
        doc.text("Due", 178, 35.5);

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);

        pages[pIdx].forEach((p, idx) => {
          if (idx % 2 === 1) {
            doc.setFillColor(243, 244, 246);
            doc.rect(14, currentY, pageWidth - 28, 8, "F");
          }
          
          doc.setTextColor(...TEXT_DARK);
          const pDateStr = fmt(p.renewalDate || p.createdAt?.toDate?.() || p.createdAt);
          doc.text(pDateStr, 16, currentY + 5.5);
          
          const truncatedName = p.memberName?.length > 22 ? p.memberName.slice(0, 20) + ".." : p.memberName;
          doc.text(`${truncatedName} (${p.memberContact})`, 42, currentY + 5.5);
          
          doc.text(p.planType || "—", 95, currentY + 5.5);
          doc.text(p.paymentMethod || "—", 125, currentY + 5.5);
          
          doc.setTextColor(...GREEN);
          doc.text(`INR ${p.amountPaid?.toLocaleString("en-IN") || 0}`, 152, currentY + 5.5);
          
          doc.setTextColor(...((p.dueAmount || 0) > 0 ? RED : TEXT_MUTED));
          doc.text(`INR ${p.dueAmount?.toLocaleString("en-IN") || 0}`, 178, currentY + 5.5);
          
          currentY += 8;
        });

        drawChrome(pIdx + 1, totalPages);
      }

      const filename = `${gymName.replace(/\s+/g, "_")}_Transactions_${fmtShortDate(start)}_to_${fmtShortDate(end)}.pdf`;
      doc.save(filename);
      setShowDownloadModal(false);
    } catch (err) {
      console.error("PDF generation failed:", err);
      alert("Failed to export PDF: " + err.message);
    } finally {
      setGenerating(false);
    }
  };

  useEffect(() => {
    if (!currentAdminGymId) return;
    const unsub = subscribeToGymPayments(currentAdminGymId, (data) => {
      setPayments(data);
      setLoading(false);
    });
    return () => unsub();
  }, [currentAdminGymId]);

  // Derived metrics
  const totalRevenue = payments.reduce((sum, p) => sum + (p.amountPaid || 0), 0);
  const totalDues = payments.reduce((sum, p) => sum + (p.dueAmount || 0), 0);
  
  // Calculate payments this month
  const thisMonthPayments = payments.filter((p) => {
    const pDate = new Date(p.renewalDate || p.createdAt?.toDate?.() || p.createdAt);
    const today = new Date();
    return pDate.getFullYear() === today.getFullYear() && pDate.getMonth() === today.getMonth();
  });
  const revenueThisMonth = thisMonthPayments.reduce((sum, p) => sum + (p.amountPaid || 0), 0);

  // Filtered payments
  const filteredPayments = payments.filter((p) => {
    const matchesSearch =
      p.memberName?.toLowerCase().includes(search.toLowerCase()) ||
      p.memberContact?.includes(search);

    const matchesMethod = methodFilter === "All" || p.paymentMethod === methodFilter;

    let matchesStatus = true;
    if (statusFilter === "Fully Paid") {
      matchesStatus = (p.dueAmount || 0) === 0;
    } else if (statusFilter === "Has Dues") {
      matchesStatus = (p.dueAmount || 0) > 0;
    }

    return matchesSearch && matchesMethod && matchesStatus;
  });

  return (
    <Layout title="Payments & Dues" subtitle="Track member billing, dues, and gym revenues">
      <div className="payments-container" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "24px" }}>
        
        {/* Style block for mobile-first tables & page animations */}
        <style>{`
          .metrics-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 16px;
            width: 100%;
          }
          @media (min-width: 640px) {
            .metrics-grid {
              grid-template-columns: repeat(3, 1fr);
            }
          }
          .metric-card {
            border-radius: var(--radius-md);
            padding: 20px;
            color: #ffffff;
            box-shadow: 0 4px 12px rgba(0,0,0,0.05);
            transition: transform var(--transition);
          }
          .metric-card:hover {
            transform: translateY(-2px);
          }
          .metric-lbl {
            font-size: 0.8rem;
            text-transform: uppercase;
            font-weight: 700;
            opacity: 0.85;
            letter-spacing: 0.05em;
          }
          .metric-val {
            font-family: var(--font-head);
            font-size: 1.8rem;
            font-weight: 900;
            margin-top: 8px;
          }
          .payments-table-card {
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: var(--radius-md);
            overflow: hidden;
            box-shadow: 0 2px 8px rgba(0,0,0,0.02);
          }
          .payments-filter-bar {
            display: flex;
            flex-direction: column;
            gap: 12px;
            padding: 16px;
            border-bottom: 1px solid var(--border);
            background: var(--bg-surface);
          }
          @media (min-width: 768px) {
            .payments-filter-bar {
              flex-direction: row;
              align-items: center;
              justify-content: space-between;
            }
          }
          .payments-search-input {
            padding: 8px 16px;
            border: 1px solid var(--border);
            border-radius: var(--radius-sm);
            background: var(--bg-card);
            color: var(--text-primary);
            flex: 1;
            max-width: 400px;
          }
          .payments-selects {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            width: 100%;
          }
          @media (min-width: 768px) {
            .payments-selects {
              width: auto;
              flex-wrap: nowrap;
            }
          }
          .payments-select {
            flex: 1;
            min-width: 120px;
            padding: 8px 12px;
            border: 1px solid var(--border);
            border-radius: var(--radius-sm);
            background: var(--bg-card);
            color: var(--text-primary);
          }
          
          /* Mobile-First Table Styles */
          .p-table {
            width: 100%;
            border-collapse: collapse;
          }
          .p-thead {
            display: none; /* Hide headers on mobile */
          }
          .p-tbody tr {
            display: block;
            border-bottom: 1px solid var(--border);
            padding: 16px;
            background: var(--bg-card);
          }
          .p-tbody td {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 6px 0;
            font-size: 0.9rem;
            border: none;
          }
          .p-tbody td::before {
            content: attr(data-label);
            font-weight: 700;
            color: var(--text-secondary);
            font-size: 0.8rem;
            text-transform: uppercase;
          }
          .p-tbody td.p-actions {
            justify-content: flex-end;
            margin-top: 8px;
            border-top: 1px dashed var(--border);
            padding-top: 10px;
          }
          .p-tbody td.p-actions::before {
            display: none;
          }
          
          /* Desktop Table Styles overrides */
          @media (min-width: 768px) {
            .p-thead {
              display: table-header-group;
              background: var(--bg-surface);
            }
            .p-thead th {
              padding: 12px 16px;
              text-align: left;
              font-size: 0.78rem;
              font-weight: 700;
              color: var(--text-secondary);
              text-transform: uppercase;
              border-bottom: 1px solid var(--border);
            }
            .p-tbody tr {
              display: table-row;
              padding: 0;
            }
            .p-tbody tr:hover {
              background: rgba(0, 0, 0, 0.01);
            }
            .p-tbody td {
              display: table-cell;
              padding: 14px 16px;
              border-bottom: 1px solid var(--border);
            }
            .p-tbody td::before {
              display: none;
            }
            .p-tbody td.p-actions {
              display: table-cell;
              margin-top: 0;
              border-top: none;
              padding-top: 14px;
            }
          }
        `}</style>

        {/* Dashboard Metrics */}
        <section className="metrics-grid">
          <div className="metric-card" style={{ background: "linear-gradient(135deg, #10b981, #059669)" }}>
            <span className="metric-lbl">Total Revenue</span>
            <div className="metric-val">₹{totalRevenue.toLocaleString("en-IN")}</div>
          </div>
          <div className="metric-card" style={{ background: "linear-gradient(135deg, #f43f5e, #e11d48)" }}>
            <span className="metric-lbl">Pending Dues</span>
            <div className="metric-val">₹{totalDues.toLocaleString("en-IN")}</div>
          </div>
          <div className="metric-card" style={{ background: "linear-gradient(135deg, #3b82f6, #2563eb)" }}>
            <span className="metric-lbl">Revenue (This Month)</span>
            <div className="metric-val">₹{revenueThisMonth.toLocaleString("en-IN")}</div>
          </div>
        </section>

        {/* Payments Table/Card List */}
        <section className="payments-table-card">
          <div className="payments-filter-bar">
            <div style={{ position: "relative", flex: 1, maxWidth: "400px", width: "100%" }}>
              <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", display: "inline-flex", alignItems: "center", color: "var(--text-muted)" }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              </span>
              <input
                type="search"
                className="payments-search-input"
                style={{ paddingLeft: "36px", width: "100%", maxWidth: "none" }}
                placeholder="Search member name or phone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="payments-selects" style={{ alignItems: "center" }}>
              <select
                className="payments-select"
                value={methodFilter}
                onChange={(e) => setMethodFilter(e.target.value)}
              >
                <option value="All">All Methods</option>
                <option value="Cash">Cash</option>
                <option value="UPI">UPI</option>
                <option value="Card">Card</option>
                <option value="Online">Online</option>
              </select>
              <select
                className="payments-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="All">All Statuses</option>
                <option value="Fully Paid">Fully Paid</option>
                <option value="Has Dues">Has Dues</option>
              </select>
              <button
                className="btn btn-primary"
                style={{
                  padding: "8px 16px",
                  fontSize: "0.85rem",
                  borderRadius: "var(--radius-sm)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  whiteSpace: "nowrap",
                  marginTop: 0,
                  height: "38px",
                  flex: 1,
                  minWidth: "120px"
                }}
                onClick={() => setShowDownloadModal(true)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Export PDF
              </button>
            </div>
          </div>

          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "40px" }}>
              <div className="spinner" />
            </div>
          ) : filteredPayments.length === 0 ? (
            <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
              No billing records match your filters.
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="p-table">
                <thead className="p-thead">
                  <tr>
                    <th>Date</th>
                    <th>Member</th>
                    <th>Plan</th>
                    <th>Method</th>
                    <th>Paid</th>
                    <th>Due</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody className="p-tbody">
                  {filteredPayments.map((p) => {
                    const hasDues = (p.dueAmount || 0) > 0;
                    return (
                      <tr key={p.id}>
                        <td data-label="Date">{fmt(p.renewalDate || p.createdAt?.toDate?.() || p.createdAt)}</td>
                        <td data-label="Member">
                          <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>{p.memberName}</div>
                          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{p.memberContact}</div>
                        </td>
                        <td data-label="Plan">{p.planType}</td>
                        <td data-label="Method">{p.paymentMethod}</td>
                        <td data-label="Paid" style={{ fontWeight: 700, color: "var(--emerald)" }}>₹{p.amountPaid?.toLocaleString("en-IN")}</td>
                        <td data-label="Due" style={{ fontWeight: 700, color: hasDues ? "var(--rose)" : "var(--text-muted)" }}>
                          ₹{p.dueAmount?.toLocaleString("en-IN")}
                        </td>
                        <td className="p-actions">
                          {hasDues ? (
                            <button
                              className="btn btn-ghost"
                              style={{
                                padding: "4px 10px",
                                fontSize: "0.78rem",
                                borderColor: "var(--rose)",
                                color: "var(--rose)",
                                borderRadius: "8px",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                              onClick={() => setCollectingPayment(p)}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M6 3h12" />
                                <path d="M6 8h12" />
                                <path d="m6 13 8.5 8" />
                                <path d="M6 13h3" />
                                <path d="M9 13c6.667 0 6.667-10 0-10" />
                              </svg>
                              Collect Due
                            </button>
                          ) : (
                            <span style={{ fontSize: "0.8rem", color: "var(--emerald)", fontWeight: 700 }}>✓ Paid</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* Collect Dues Modal */}
      {collectingPayment && (
        <CollectDueModal
          payment={collectingPayment}
          onClose={() => setCollectingPayment(null)}
          onSaved={() => setCollectingPayment(null)}
        />
      )}

      {/* Download PDF Modal */}
      {showDownloadModal && (
        <DownloadModal
          onClose={() => setShowDownloadModal(false)}
          onDownload={handleDownloadPDF}
          preset={downloadPreset}
          setPreset={setDownloadPreset}
          customStart={customStart}
          setCustomStart={setCustomStart}
          customEnd={customEnd}
          setCustomEnd={setCustomEnd}
          applyFilters={applyFilters}
          setApplyFilters={setApplyFilters}
          generating={generating}
          search={search}
          methodFilter={methodFilter}
          statusFilter={statusFilter}
        />
      )}
    </Layout>
  );
}

// ─── Collect Due Modal Component ──────────────────────────────────────────────

function CollectDueModal({ payment, onClose, onSaved }) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Cash");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const collectVal = Number(amount);
    if (isNaN(collectVal) || collectVal <= 0) return alert("Enter a valid amount to collect");
    if (collectVal > payment.dueAmount) return alert("Cannot collect more than the pending due amount");

    setSaving(true);
    try {
      const updatedPaid = (payment.amountPaid || 0) + collectVal;
      const updatedDue = Math.max(0, (payment.dueAmount || 0) - collectVal);

      // Update the payment document in Firestore
      await updateDocument("payments", payment.id, {
        amountPaid: updatedPaid,
        dueAmount: updatedDue,
        paymentMethod: method, // Update to the latest payment method used to clear the due
      });

      onSaved();
    } catch (err) {
      console.error(err);
      alert("Failed to clear due: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content" style={{ maxWidth: "400px" }}>
        <div className="modal-header">
          <h2 className="modal-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: "var(--rose)" }}>
              <path d="M6 3h12" />
              <path d="M6 8h12" />
              <path d="m6 13 8.5 8" />
              <path d="M6 13h3" />
              <path d="M9 13c6.667 0 6.667-10 0-10" />
            </svg>
            Collect Due Payment
          </h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <form className="modal-form" onSubmit={handleSubmit}>
          <div style={{ marginBottom: "16px", fontSize: "0.9rem", color: "var(--text-secondary)" }}>
            Collecting pending due for <strong style={{ color: "var(--text-primary)" }}>{payment.memberName}</strong>.
            <div style={{ marginTop: "4px" }}>Outstanding Dues: <strong style={{ color: "var(--rose)" }}>₹{payment.dueAmount?.toLocaleString("en-IN")}</strong></div>
          </div>

          <div className="form-group">
            <label htmlFor="due-amount-collected">Amount Collected (₹)</label>
            <input
              id="due-amount-collected"
              type="number"
              required
              max={payment.dueAmount}
              min="1"
              placeholder="e.g. 500"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="due-payment-method">Payment Method</label>
            <select
              id="due-payment-method"
              className="form-select"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              <option value="Cash">Cash</option>
              <option value="UPI">UPI</option>
              <option value="Card">Card</option>
              <option value="Online">Online</option>
            </select>
          </div>

          <div className="modal-actions" style={{ marginTop: "20px" }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ flex: 2 }} disabled={saving}>
              {saving ? "Updating..." : "Clear Due Amount"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Download Modal Component ───────────────────────────────────────────────

function DownloadModal({
  onClose,
  onDownload,
  preset,
  setPreset,
  customStart,
  setCustomStart,
  customEnd,
  setCustomEnd,
  applyFilters,
  setApplyFilters,
  generating,
  search,
  methodFilter,
  statusFilter,
}) {
  // We can calculate resolved dates for display
  const getDisplayRange = () => {
    const today = new Date();
    let start, end;
    if (preset === "this_month") {
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    } else if (preset === "last_month") {
      start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      end = new Date(today.getFullYear(), today.getMonth(), 0);
    } else if (preset === "last_3_months") {
      start = new Date(today.getFullYear(), today.getMonth() - 3, 1);
      end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    } else {
      start = customStart ? new Date(customStart) : null;
      end = customEnd ? new Date(customEnd) : null;
    }
    return { start, end };
  };

  const { start, end } = getDisplayRange();

  const formatDateValue = (d) => {
    if (!d) return "";
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content" style={{ maxWidth: "450px" }}>
        <div className="modal-header">
          <h2 className="modal-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: "var(--cyan)" }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export Transactions PDF
          </h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="modal-form">
          {/* Preset Pills */}
          <div className="form-group" style={{ marginBottom: "16px" }}>
            <label>Select Date Range Preset</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px", marginTop: "6px" }}>
              <button
                type="button"
                className={`btn ${preset === "this_month" ? "btn-primary" : "btn-ghost"}`}
                style={{
                  padding: "8px",
                  fontSize: "0.85rem",
                  borderRadius: "8px",
                  border: preset === "this_month" ? "none" : "1px solid var(--border)",
                  background: preset === "this_month" ? "" : "transparent",
                  color: preset === "this_month" ? "#fff" : "var(--text-primary)"
                }}
                onClick={() => setPreset("this_month")}
              >
                This Month
              </button>
              <button
                type="button"
                className={`btn ${preset === "last_month" ? "btn-primary" : "btn-ghost"}`}
                style={{
                  padding: "8px",
                  fontSize: "0.85rem",
                  borderRadius: "8px",
                  border: preset === "last_month" ? "none" : "1px solid var(--border)",
                  background: preset === "last_month" ? "" : "transparent",
                  color: preset === "last_month" ? "#fff" : "var(--text-primary)"
                }}
                onClick={() => setPreset("last_month")}
              >
                Last Month
              </button>
              <button
                type="button"
                className={`btn ${preset === "last_3_months" ? "btn-primary" : "btn-ghost"}`}
                style={{
                  padding: "8px",
                  fontSize: "0.85rem",
                  borderRadius: "8px",
                  border: preset === "last_3_months" ? "none" : "1px solid var(--border)",
                  background: preset === "last_3_months" ? "" : "transparent",
                  color: preset === "last_3_months" ? "#fff" : "var(--text-primary)"
                }}
                onClick={() => setPreset("last_3_months")}
              >
                Last 3 Months
              </button>
              <button
                type="button"
                className={`btn ${preset === "custom" ? "btn-primary" : "btn-ghost"}`}
                style={{
                  padding: "8px",
                  fontSize: "0.85rem",
                  borderRadius: "8px",
                  border: preset === "custom" ? "none" : "1px solid var(--border)",
                  background: preset === "custom" ? "" : "transparent",
                  color: preset === "custom" ? "#fff" : "var(--text-primary)"
                }}
                onClick={() => setPreset("custom")}
              >
                Custom Range
              </button>
            </div>
          </div>

          {/* Date Picker Inputs */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="custom-start-date">Start Date</label>
              <div className="date-input-container" style={{ position: "relative" }}>
                <input
                  type="text"
                  readOnly
                  disabled={preset !== "custom"}
                  value={displayDate(preset === "custom" ? customStart : formatDateValue(start))}
                  placeholder="dd/mm/yyyy"
                  style={{
                    width: "100%",
                    opacity: preset === "custom" ? 1 : 0.6,
                    cursor: preset === "custom" ? "pointer" : "not-allowed"
                  }}
                />
                <input
                  id="custom-start-date"
                  type="date"
                  disabled={preset !== "custom"}
                  value={preset === "custom" ? customStart : formatDateValue(start)}
                  onChange={(e) => setCustomStart(e.target.value)}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    opacity: 0,
                    cursor: preset === "custom" ? "pointer" : "not-allowed",
                    colorScheme: "light"
                  }}
                />
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="custom-end-date">End Date</label>
              <div className="date-input-container" style={{ position: "relative" }}>
                <input
                  type="text"
                  readOnly
                  disabled={preset !== "custom"}
                  value={displayDate(preset === "custom" ? customEnd : formatDateValue(end))}
                  placeholder="dd/mm/yyyy"
                  style={{
                    width: "100%",
                    opacity: preset === "custom" ? 1 : 0.6,
                    cursor: preset === "custom" ? "pointer" : "not-allowed"
                  }}
                />
                <input
                  id="custom-end-date"
                  type="date"
                  disabled={preset !== "custom"}
                  value={preset === "custom" ? customEnd : formatDateValue(end)}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    opacity: 0,
                    cursor: preset === "custom" ? "pointer" : "not-allowed",
                    colorScheme: "light"
                  }}
                />
              </div>
            </div>
          </div>

          {/* Checkbox for Filters */}
          <div className="form-group" style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "12px", background: "var(--bg-surface)", borderRadius: "8px", border: "1px solid var(--border)", marginBottom: "20px" }}>
            <input
              id="apply-filters-checkbox"
              type="checkbox"
              checked={applyFilters}
              onChange={(e) => setApplyFilters(e.target.checked)}
              style={{ marginTop: "3px", width: "16px", height: "16px", cursor: "pointer" }}
            />
            <label htmlFor="apply-filters-checkbox" style={{ fontSize: "0.85rem", cursor: "pointer", userSelect: "none", color: "var(--text-secondary)" }}>
              <strong style={{ color: "var(--text-primary)" }}>Apply active table filters</strong>
              <div style={{ marginTop: "4px", fontSize: "0.8rem", opacity: 0.85 }}>
                Respects search query, method, and payment status currently set in the table.
                {applyFilters && (
                  <div style={{ marginTop: "4px", color: "var(--cyan)", fontWeight: 600 }}>
                    Active filters: {search ? `Search "${search}"` : "None"} • Method: {methodFilter} • Status: {statusFilter}
                  </div>
                )}
              </div>
            </label>
          </div>

          {/* Actions */}
          <div className="modal-actions" style={{ marginTop: "20px" }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} style={{ flex: 1, border: "1px solid var(--border)" }} disabled={generating}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ flex: 2 }}
              onClick={onDownload}
              disabled={generating || (preset === "custom" && (!customStart || !customEnd))}
            >
              {generating ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                  <div className="spinner" style={{ width: "14px", height: "14px", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff" }} />
                  Generating...
                </div>
              ) : (
                "Download PDF"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
