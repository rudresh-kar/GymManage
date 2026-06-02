import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import { useAuth } from "../contexts/AuthContext";
import { subscribeToGymPayments, updateDocument } from "../firebase/firestore";

function fmt(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function PaymentsPage() {
  const { gymId: currentAdminGymId, userProfile } = useAuth();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [collectingPayment, setCollectingPayment] = useState(null);

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
            gap: 8px;
            width: 100%;
          }
          @media (min-width: 768px) {
            .payments-selects {
              width: auto;
            }
          }
          .payments-select {
            flex: 1;
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
            <div className="payments-selects">
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
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
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
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: "var(--rose)" }}><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
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
