import { useState, useEffect, useCallback, useRef } from "react";
import Layout from "../components/Layout";
import {
  subscribeToMembers,
  addMember,
  deleteMember,
  createUserProfile,
  updateMember,
  subscribeToMemberAttendance,
  addPayment,
  updateDocument
} from "../firebase/firestore";
import { createMemberAccount } from "../firebase/auth";
import { useAuth } from "../contexts/AuthContext";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PLAN_DAYS = { "1 Month": 30, "3 Months": 90, "1 Year": 365 };

const PLAN_COLORS = {
  "1 Month": { accent: "#2563eb", gradient: "linear-gradient(135deg,#2563eb,#4f46e5)" },
  "3 Months": { accent: "#4f46e5", gradient: "linear-gradient(135deg,#4f46e5,#db2777)" },
  "1 Year": { accent: "#10b981", gradient: "linear-gradient(135deg,#10b981,#0ea5e9)" },
};

function getEndDate(startDate, plan) {
  if (!startDate || !plan) return null;
  const d = new Date(startDate);
  d.setDate(d.getDate() + (PLAN_DAYS[plan] || 30));
  return d;
}

/**
 * Computes membership status.
 * Uses endDate field if available (set during renewal), otherwise calculates from startDate + plan.
 */
function getMemberStatus(startDate, plan, endDate) {
  let end;
  if (endDate) {
    end = new Date(endDate);
  } else {
    end = getEndDate(startDate, plan);
  }
  if (!end || isNaN(end.getTime())) return { label: "Unknown", cls: "badge-soon" };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysLeft = Math.ceil((end - today) / 86400000);
  if (daysLeft < 0) return { label: "Expired", cls: "badge-expired" };
  if (daysLeft <= 7) return { label: "Expiring Soon", cls: "badge-soon" };
  return { label: "Active", cls: "badge-active" };
}

function fmt(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function initials(name = "") {
  return name.trim().split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
}

// ─── Add Member Modal ─────────────────────────────────────────────────────────

const EMPTY_FORM = { name: "", contact: "", email: "", password: "", plan: "1 Month", startDate: "" };

function AddMemberModal({ onClose, onSaved, adminGymId }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k) => (e) => {
    let val = e.target.value;
    if (k === "contact") {
      val = val.replace(/[^0-9]/g, "").slice(0, 10);
    }
    setForm((p) => ({ ...p, [k]: val }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return setError("Name is required.");
    if (!form.contact.trim()) return setError("Contact number is required.");
    const cleanPhone = form.contact.replace(/[^0-9]/g, "");
    if (cleanPhone.length !== 10) return setError("Contact number must be exactly 10 digits.");

    if (form.email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(form.email.trim())) return setError("Please enter a valid email address.");
    }

    if (form.password.length < 6) return setError("Password must be at least 6 characters.");
    if (!form.startDate) return setError("Start date is required.");
    setSaving(true);
    setError("");
    try {
      const registrationEmail = form.email.trim() || `${cleanPhone}@flexpro.in`;

      // 1. Create Firebase Auth account for member (secondary app — admin stays signed in)
      const uid = await createMemberAccount(registrationEmail, form.password);

      // 2. Create the member document in Firestore
      const memberId = await addMember({
        name: form.name.trim(),
        contact: cleanPhone,
        email: form.email.trim() || "",
        plan: form.plan,
        startDate: form.startDate,
        endDate: getEndDate(form.startDate, form.plan)?.toISOString().split("T")[0] ?? "",
        status: "active",
        uid,
        gymId: adminGymId,
      });

      // 3. Create user profile so this account gets redirected to /member-portal
      await createUserProfile(uid, {
        role: "member",
        memberId,
        name: form.name.trim(),
        email: form.email.trim() || "",
        contact: cleanPhone,
        password: form.password // Saved for phone-based password reset
      });

      onSaved();
    } catch (err) {
      console.error(err);
      if (err.code === "auth/email-already-in-use") {
        setError("This email is already registered. Use a different email.");
      } else if (err.code === "auth/invalid-email") {
        setError("Please enter a valid email address.");
      } else {
        setError("Failed to add member: " + (err.message || "Please try again."));
      }
    } finally {
      setSaving(false);
    }
  };

  // Close on Escape key
  useEffect(() => {
    const handler = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal-content">
        <div className="modal-header">
          <h2 className="modal-title" id="modal-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: "var(--cyan)" }}>
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add Member
          </h2>
          <button id="modal-close-btn" className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {error && (
          <div className="auth-error" style={{ marginBottom: "18px" }}>{error}</div>
        )}

        <form className="modal-form" onSubmit={handleSubmit} noValidate>
          {/* Name */}
          <div className="form-group">
            <label htmlFor="member-name">Full Name</label>
            <input
              id="member-name"
              type="text"
              placeholder="e.g. Rahul Sharma"
              value={form.name}
              onChange={set("name")}
              autoFocus
            />
          </div>

          {/* Contact */}
          <div className="form-group">
            <label htmlFor="member-contact">Contact Number</label>
            <input
              id="member-contact"
              type="tel"
              placeholder="e.g. +91 98765 43210"
              value={form.contact}
              onChange={set("contact")}
            />
          </div>

          {/* Email */}
          <div className="form-group">
            <label htmlFor="member-email">Email (Optional - for portal login)</label>
            <input
              id="member-email"
              type="email"
              placeholder="Optional: member@email.com"
              value={form.email}
              onChange={set("email")}
            />
          </div>

          {/* Password */}
          <div className="form-group">
            <label htmlFor="member-password">Initial Password (min 6 chars)</label>
            <input
              id="member-password"
              type="password"
              placeholder="Set a starting password"
              value={form.password}
              onChange={set("password")}
            />
          </div>

          {/* Plan */}
          <div className="form-group">
            <label htmlFor="member-plan">Membership Plan</label>
            <select
              id="member-plan"
              className="form-select"
              value={form.plan}
              onChange={set("plan")}
            >
              <option value="1 Month">1 Month — 30 days</option>
              <option value="3 Months">3 Months — 90 days</option>
              <option value="1 Year">1 Year — 365 days</option>
            </select>
          </div>

          {/* Start Date */}
          <div className="form-group">
            <label htmlFor="member-startdate">Start Date</label>
            <input
              id="member-startdate"
              type="date"
              value={form.startDate}
              onChange={set("startDate")}
              max={new Date().toISOString().split("T")[0]}
              style={{ colorScheme: "light" }}
            />
          </div>

          {/* End Date preview */}
          {form.startDate && (
            <div style={{
              background: "rgba(37,99,235,0.06)",
              border: "1px solid rgba(37,99,235,0.18)",
              borderRadius: "var(--radius-sm)",
              padding: "10px 14px",
              fontSize: "0.84rem",
              color: "var(--text-secondary)",
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ verticalAlign: "middle", marginRight: "6px", color: "var(--cyan)" }}>
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              Membership ends on{" "}
              <strong style={{ color: "var(--cyan)" }}>
                {fmt(getEndDate(form.startDate, form.plan)?.toISOString().split("T")[0])}
              </strong>
            </div>
          )}

          {/* Actions */}
          <div className="modal-actions">
            <button
              type="button"
              id="modal-cancel-btn"
              className="btn btn-ghost"
              style={{ flex: 1 }}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              id="modal-save-btn"
              className="btn btn-primary"
              style={{ flex: 2 }}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save Member"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Renew Member Modal ───────────────────────────────────────────────────────

function RenewMemberModal({ member, onClose, onSaved, planPricing, gymName }) {
  const [plan, setPlan] = useState("1 Month");
  const [amountPaid, setAmountPaid] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [saving, setSaving] = useState(false);

  const planAmount = planPricing?.[plan] || 0;
  const dueAmount = Math.max(0, planAmount - (Number(amountPaid) || 0));

  // Calculate new end date based on active/expired status
  const computeNewEndDate = () => {
    const status = getMemberStatus(member.startDate, member.plan, member.endDate);
    let baseDate = new Date(); // If expired, start from today
    if (status.label !== "Expired") {
      // active or expiring soon, append to current end date
      baseDate = new Date(member.endDate || getEndDate(member.startDate, member.plan));
    }
    const d = new Date(baseDate);
    d.setDate(d.getDate() + (PLAN_DAYS[plan] || 30));
    return d.toISOString().split("T")[0];
  };

  const newEndDate = computeNewEndDate();

  const openWhatsAppReceipt = () => {
    const phone = member.contact?.replace(/[^0-9]/g, "") || "";
    const indiaPhone = phone.startsWith("91") ? phone : `91${phone}`;
    const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    const paid = Number(amountPaid) || 0;

    const msg = `🏋️ *${gymName || "FlexPro Gym"} - Payment Receipt*

Hi ${member.name}! 😊

Your membership payment details:

• *Plan:* ${plan}
• *Payment Date:* ${today}
• *Paid via:* ${paymentMethod}
• *Plan Amount:* ₹${planAmount.toLocaleString("en-IN")}
• *Amount Paid:* ₹${paid.toLocaleString("en-IN")}
• *Due Amount:* ₹${dueAmount.toLocaleString("en-IN")}

Your new membership is valid until *${fmt(newEndDate)}*.

Thank you for choosing us! 🙏
— Powered by FlexPro.in`;

    window.open(`https://wa.me/${indiaPhone}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const handleRenew = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      // 1. Update member plan + endDate
      await updateMember(member.id, {
        plan: plan,
        endDate: newEndDate,
        status: "active",
      });

      // 2. Record payment in Firestore
      const paid = Number(amountPaid) || 0;
      await addPayment({
        memberId: member.id,
        memberName: member.name,
        memberContact: member.contact || "",
        gymId: member.gymId,
        planType: plan,
        planAmount: planAmount,
        amountPaid: paid,
        dueAmount: dueAmount,
        paymentMethod: paymentMethod,
        renewalDate: new Date().toISOString().split("T")[0],
        newEndDate: newEndDate,
      });

      // 3. Open WhatsApp receipt
      openWhatsAppReceipt();

      onSaved();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content" style={{ maxWidth: "440px" }}>
        <div className="modal-header">
          <h2 className="modal-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: "var(--emerald)" }}>
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
            </svg>
            Renew Subscription
          </h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <form className="modal-form" onSubmit={handleRenew}>
          <div style={{ marginBottom: "20px", fontSize: "0.95rem", color: "var(--text-secondary)" }}>
            Renewing membership for <strong style={{ color: "var(--text-primary)" }}>{member.name}</strong>.
          </div>

          <div className="form-group">
            <label>Select New Plan</label>
            <select className="form-select" value={plan} onChange={(e) => setPlan(e.target.value)}>
              <option value="1 Month">1 Month — 30 days</option>
              <option value="3 Months">3 Months — 90 days</option>
              <option value="1 Year">1 Year — 365 days</option>
            </select>
          </div>

          <div style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.18)", borderRadius: "var(--radius-sm)", padding: "12px 16px", fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "16px" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ verticalAlign: "middle", marginRight: "6px", color: "var(--emerald)" }}>
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            New Expiry Date: <strong style={{ color: "var(--emerald)", fontSize: "0.9rem" }}>{fmt(newEndDate)}</strong>
          </div>

          {/* Payment Section */}
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: "16px", marginBottom: "8px" }}>
            <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
              Payment Details
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "var(--bg-surface)", borderRadius: "var(--radius-sm)", marginBottom: "12px" }}>
              <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>Plan Amount</span>
              <span style={{ fontSize: "1.1rem", fontWeight: 800, color: planAmount ? "var(--text-primary)" : "var(--text-muted)" }}>
                {planAmount ? `₹${planAmount.toLocaleString("en-IN")}` : "Not set"}
              </span>
            </div>

            <div className="form-group" style={{ marginBottom: "12px" }}>
              <label htmlFor="renew-amount-paid">Amount Paid (₹)</label>
              <input
                id="renew-amount-paid"
                type="number"
                placeholder="e.g. 800"
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
                min="0"
              />
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: dueAmount > 0 ? "rgba(244,63,94,0.06)" : "rgba(16,185,129,0.06)", borderRadius: "var(--radius-sm)", border: `1px solid ${dueAmount > 0 ? "rgba(244,63,94,0.2)" : "rgba(16,185,129,0.2)"}`, marginBottom: "12px" }}>
              <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>Due Amount</span>
              <span style={{ fontSize: "1.1rem", fontWeight: 800, color: dueAmount > 0 ? "var(--rose)" : "var(--emerald)" }}>
                ₹{dueAmount.toLocaleString("en-IN")}
              </span>
            </div>

            <div className="form-group" style={{ marginBottom: "0" }}>
              <label htmlFor="renew-payment-method">Payment Method</label>
              <select id="renew-payment-method" className="form-select" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <option value="Cash">Cash</option>
                <option value="UPI">UPI</option>
                <option value="Card">Card</option>
                <option value="Online">Online</option>
              </select>
            </div>
          </div>

          <div className="modal-actions" style={{ marginTop: "20px" }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ flex: 2 }} disabled={saving}>
              {saving ? "Processing…" : "Renew & Send Receipt"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Edit Member Modal ─────────────────────────────────────────────────────────

function EditMemberModal({ member, onClose, onSaved }) {
  const [name, setName] = useState(member.name || "");
  const [contact, setContact] = useState(member.contact || "");
  const [email, setEmail] = useState(member.email || "");
  const [plan, setPlan] = useState(member.plan || "1 Month");
  const [startDate, setStartDate] = useState(member.startDate || "");
  const [endDate, setEndDate] = useState(member.endDate || "");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return alert("Name is required");
    const cleanPhone = contact.replace(/[^0-9]/g, "");
    if (cleanPhone.length !== 10) return alert("Contact number must be exactly 10 digits");
    
    setSaving(true);
    try {
      await updateMember(member.id, {
        name: name.trim(),
        contact: cleanPhone,
        email: email.trim(),
        plan,
        startDate,
        endDate
      });

      if (member.uid) {
        await updateDocument("users", member.uid, {
          name: name.trim(),
          contact: cleanPhone,
          email: email.trim()
        });
      }
      onSaved();
    } catch (err) {
      console.error(err);
      alert("Failed to update member: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content" style={{ maxWidth: "440px" }}>
        <div className="modal-header">
          <h2 className="modal-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: "var(--cyan)" }}>
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Edit Member Details
          </h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="edit-name">Full Name</label>
            <input
              id="edit-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="edit-contact">Contact Number</label>
            <input
              id="edit-contact"
              type="tel"
              value={contact}
              onChange={(e) => setContact(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
            />
          </div>

          <div className="form-group">
            <label htmlFor="edit-email">Email Address</label>
            <input
              id="edit-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="edit-plan">Select Plan</label>
            <select className="form-select" id="edit-plan" value={plan} onChange={(e) => setPlan(e.target.value)}>
              <option value="1 Month">1 Month — 30 days</option>
              <option value="3 Months">3 Months — 90 days</option>
              <option value="1 Year">1 Year — 365 days</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="edit-start-date">Start Date</label>
            <input
              id="edit-start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="edit-end-date">End Date</label>
            <input
              id="edit-end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
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

// ─── Member Stats Modal ───────────────────────────────────────────────────────

export function MemberStatsModal({ member, onClose }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(5);

  useEffect(() => {
    if (!member?.id) return;
    setLoading(true);
    const unsub = subscribeToMemberAttendance(member.id, (data) => {
      setRecords(data);
      setLoading(false);
    });
    return () => unsub();
  }, [member?.id]);

  const handleLoadNext = () => {
    setVisibleCount((prev) => prev + 10);
  };

  const status = getMemberStatus(member.startDate, member.plan);
  const colors = PLAN_COLORS[member.plan] || PLAN_COLORS["1 Month"];
  const endDateStr = member.endDate || getEndDate(member.startDate, member.plan)?.toISOString().split("T")[0];

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

        <div style={{ display: "flex", alignItems: "center", gap: "16px", margin: "20px 0", background: "var(--bg-surface)", padding: "16px", borderRadius: "12px" }}>
          <div className="member-avatar" style={{ background: colors.gradient, width: "48px", height: "48px", fontSize: "1.1rem" }}>
            {initials(member.name)}
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
            <span className="badge badge-plan">{member.plan}</span>
            <span className={`badge ${status.cls}`}>{status.label}</span>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "24px" }}>
          <div>
            <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: "bold" }}>Start Date</span>
            <p style={{ margin: "4px 0 0", fontSize: "0.95rem", fontWeight: 500, color: "var(--text-primary)" }}>{fmt(member.startDate)}</p>
          </div>
          <div>
            <span style={{ fontSize: "0.78rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: "bold" }}>End Date</span>
            <p style={{ margin: "4px 0 0", fontSize: "0.95rem", fontWeight: 500, color: "var(--text-primary)" }}>{fmt(endDateStr)}</p>
          </div>
        </div>

        <h4 style={{ fontSize: "0.95rem", fontWeight: 700, marginBottom: "12px", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: "var(--cyan)" }}>
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          Attendance History ({records.length})
        </h4>

        <div style={{ maxHeight: "250px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px", paddingRight: "4px" }}>
          {records.length === 0 && !loading ? (
            <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem", padding: "20px" }}>No check-in history found.</p>
          ) : (
            <>
              {records.slice(0, visibleCount).map((r) => (
                <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: "var(--bg-base)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "0.85rem" }}>
                  <span>{new Date(r.checkInTime).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}</span>
                  <strong style={{ color: "var(--cyan)" }}>
                    {new Date(r.checkInTime).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}
                  </strong>
                </div>
              ))}
              {loading && (
                <div style={{ textAlign: "center", padding: "10px" }}>
                  <div className="spinner" style={{ width: 20, height: 20, margin: "0 auto" }} />
                </div>
              )}
              {records.length > visibleCount && !loading && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={handleLoadNext}
                  style={{ padding: "6px", fontSize: "0.8rem", borderRadius: "8px", marginTop: "4px", width: "100%" }}
                >
                  View More
                </button>
              )}
            </>
          )}
        </div>

        <div className="modal-actions" style={{ marginTop: "24px" }}>
          <button className="btn btn-primary" onClick={onClose} style={{ width: "100%" }}>Close Details</button>
        </div>
      </div>
    </div>
  );
}

// ─── Member Card ──────────────────────────────────────────────────────────────

function MemberCard({ member, onDelete, onRenew, onEdit, onViewStats, gymName }) {
  const status = getMemberStatus(member.startDate, member.plan, member.endDate);
  const colors = PLAN_COLORS[member.plan] || PLAN_COLORS["1 Month"];
  const endDateStr = member.endDate || getEndDate(member.startDate, member.plan)?.toISOString().split("T")[0];
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const confirmTimerRef = useRef(null);

  const handleDelete = async () => {
    if (deleting) return;
    if (!confirming) {
      setConfirming(true);
      // Auto-reset after 3 seconds if not confirmed
      confirmTimerRef.current = setTimeout(() => setConfirming(false), 3000);
      return;
    }
    // Confirmed! Clear the reset timer and perform delete
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    setDeleting(true);
    try {
      await onDelete(member.id);
    } catch (err) {
      console.error("Failed to delete member:", err);
      alert("Failed to delete member: " + err.message);
      setDeleting(false);
      setConfirming(false);
    }
  };

  const end = getEndDate(member.startDate, member.plan);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysLeft = end ? Math.ceil((end - today) / 86400000) : 0;
  const isExpired = daysLeft < 0;
  const daysOverdue = Math.abs(daysLeft);

  const handleWhatsAppReminder = () => {
    const phone = member.contact?.replace(/[^0-9]/g, "") || "";
    const indiaPhone = phone.startsWith("91") ? phone : `91${phone}`;
    const expiryDateStr = fmt(endDateStr);
    const gym = gymName || "our gym";

    const msg = `🏋️ *FlexPro Gym Reminder*

Hi ${member.name}! 👋

Your *${member.plan}* membership at *${gym}* ${isExpired ? "expired on" : "is expiring on"} *${expiryDateStr}* ${isExpired ? `(${daysOverdue} days ago)` : `(${daysLeft} days left)`}.

🔄 Please visit the gym to renew your membership.

Thank you for being a valued member! 💪
— ${gym}`;

    window.open(`https://wa.me/${indiaPhone}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  return (
    <article
      className="member-card"
      style={{ "--member-accent": colors.accent }}
    >
      {/* Header */}
      <div className="member-card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div
            className="member-avatar"
            style={{ background: colors.gradient }}
            aria-hidden="true"
          >
            {initials(member.name)}
          </div>
          <div>
            <div
              className="member-name"
              onClick={() => onViewStats(member)}
              style={{ cursor: "pointer", textDecoration: "underline", textDecorationColor: "rgba(37,99,235,0.4)" }}
            >
              {member.name}
            </div>
            <div className="member-contact" style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: "var(--text-muted)" }}>
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
              {member.contact ? (
                <a href={`tel:${member.contact}`} style={{ color: "inherit", textDecoration: "underline" }}>
                  {member.contact}
                </a>
              ) : "—"}
            </div>
          </div>
        </div>

        {/* Badges container at top-right */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", alignItems: "flex-end", flexShrink: 0 }}>
          <span className={`badge badge-plan`} style={{ whiteSpace: "nowrap" }}>{member.plan}</span>
          <span className={`badge ${status.cls}`} style={{ whiteSpace: "nowrap" }}>{status.label}</span>
        </div>
      </div>

      {/* Body */}
      <div className="member-card-body">
        <div className="member-info-row">
          <span className="member-info-label">Start Date</span>
          <span className="member-info-value">{fmt(member.startDate)}</span>
        </div>
        <div className="member-info-row">
          <span className="member-info-label">End Date</span>
          <span className="member-info-value">{fmt(endDateStr)}</span>
        </div>
      </div>

      {/* Footer */}
      <div className="member-card-footer" style={{ display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
        <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end", width: "100%" }}>
          {(status.label === "Expiring Soon" || status.label === "Expired") && (
            <button
              type="button"
              className="btn"
              style={{
                padding: "4px 8px",
                fontSize: "0.8rem",
                borderRadius: "8px",
                background: "linear-gradient(135deg, #25d366, #128c7e)",
                color: "#fff",
                border: "none",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                cursor: "pointer"
              }}
              onClick={handleWhatsAppReminder}
              title="Send WhatsApp Reminder"
              aria-label={`Send WhatsApp reminder to ${member.name}`}
            >
              Remind
            </button>
          )}
          <button
            className="btn btn-primary"
            style={{ padding: "4px 12px", fontSize: "0.8rem", borderRadius: "8px" }}
            onClick={() => onRenew(member)}
            aria-label={`Renew ${member.name}`}
          >
            Renew
          </button>
          <button
            className="icon-btn"
            title="Edit member details"
            onClick={() => onEdit(member)}
            aria-label={`Edit ${member.name}`}
            style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z" />
            </svg>
          </button>
          <button
            id={`delete-member-${member.id}`}
            className="icon-btn"
            title={deleting ? "Deleting..." : confirming ? "Click again to confirm delete" : "Delete member"}
            onClick={handleDelete}
            disabled={deleting}
            style={deleting ? { opacity: 0.5, cursor: "not-allowed" } : confirming ? { borderColor: "var(--rose)", color: "var(--rose)" } : {}}
            aria-label={`Delete ${member.name}`}
          >
            {deleting ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ animation: "spin 1s linear infinite" }}>
                <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="32" />
              </svg>
            ) : confirming ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 6h18" />
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                <line x1="10" x2="10" y1="11" y2="17" />
                <line x1="14" x2="14" y1="11" y2="17" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </article>
  );
}

// ─── Members Page ─────────────────────────────────────────────────────────────

export default function MembersPage() {
  const { gymId: currentAdminGymId, userProfile } = useAuth();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [renewMember, setRenewMember] = useState(null);
  const [editMember, setEditMember] = useState(null);
  const [viewMemberStats, setViewMemberStats] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  // Real-time Firestore subscription
  useEffect(() => {
    if (!currentAdminGymId) return;
    const unsub = subscribeToMembers(currentAdminGymId, (data) => {
      setMembers(data);
      setLoading(false);
    });
    return () => unsub();
  }, [currentAdminGymId]);

  const handleDelete = useCallback(async (id) => {
    await deleteMember(id);
  }, []);

  const handleSaved = () => setShowModal(false);

  // 1. Filter members so the Admin ONLY sees members belonging to their specific gym
  const tenantMembers = members;

  // Derived stats (based on tenantMembers)
  const total = tenantMembers.length;
  const active = tenantMembers.filter((m) => getMemberStatus(m.startDate, m.plan, m.endDate).label === "Active").length;
  const expiring = tenantMembers.filter((m) => getMemberStatus(m.startDate, m.plan, m.endDate).label === "Expiring Soon").length;
  const expired = tenantMembers.filter((m) => getMemberStatus(m.startDate, m.plan, m.endDate).label === "Expired").length;

  // Filtered list (search and status filter within tenantMembers)
  const filtered = tenantMembers.filter((m) => {
    if (statusFilter !== "All") {
      const statusLabel = getMemberStatus(m.startDate, m.plan, m.endDate).label;
      if (statusLabel !== statusFilter) return false;
    }
    return (
      m.name?.toLowerCase().includes(search.toLowerCase()) ||
      m.contact?.includes(search) ||
      m.plan?.toLowerCase().includes(search.toLowerCase())
    );
  });

  return (
    <Layout title="Members" subtitle="Manage your gym members">
      <div className="page-section">

        {/* Summary bar (2x2 Grid) */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "16px", marginBottom: "24px" }}>
          {[
            { label: "TOTAL MEMBERS", value: total, icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--cyan)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>, bg: "rgba(6,182,212,0.1)", key: "All" },
            { label: "ACTIVE", value: active, icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--emerald)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>, bg: "rgba(16,185,129,0.1)", key: "Active" },
            { label: "EXPIRING SOON", value: expiring, icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>, bg: "rgba(245,158,11,0.1)", key: "Expiring Soon" },
            { label: "EXPIRED", value: expired, icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--rose)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>, bg: "rgba(244,63,94,0.1)", key: "Expired" },
          ].map((s) => (
            <div
              key={s.label}
              onClick={() => setStatusFilter(s.key)}
              style={{
                background: "#ffffff",
                borderRadius: "16px",
                boxShadow: statusFilter === s.key ? "0 0 0 2px var(--cyan), var(--shadow-card)" : "0 1px 3px rgba(0,0,0,0.1)",
                padding: "16px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                textAlign: "center",
                cursor: "pointer",
                transition: "all var(--transition)",
                border: statusFilter === s.key ? "1px solid var(--cyan)" : "1px solid transparent"
              }}
            >
              <div style={{ width: "42px", height: "42px", borderRadius: "50%", background: s.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem", marginBottom: "12px" }}>
                {s.icon}
              </div>
              <div style={{ fontSize: "1.75rem", fontWeight: "700", color: "#1f2937", lineHeight: "1" }}>{s.value}</div>
              <div style={{ fontSize: "0.75rem", color: "#6b7280", fontWeight: "600", textTransform: "uppercase", marginTop: "8px", letterSpacing: "0.05em" }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="toolbar">
          <div style={{ position: "relative", flex: 1, maxWidth: "400px" }}>
            <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", display: "inline-flex", alignItems: "center", color: "var(--text-muted)" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </span>
            <input
              id="members-search"
              type="search"
              className="search-input"
              style={{ paddingLeft: "36px" }}
              placeholder="Search by name, contact, or plan…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            id="add-member-btn"
            className="btn btn-primary"
            onClick={() => setShowModal(true)}
            style={{ display: "flex", alignItems: "center", gap: "6px" }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Member
          </button>
        </div>

        {/* Filter Tabs */}
        <div style={{ display: "flex", gap: "8px", overflowX: "auto", paddingBottom: "12px", marginBottom: "20px", borderBottom: "1px solid var(--border)" }}>
          {["All", "Active", "Expiring Soon", "Expired"].map((tab) => {
            const isActive = statusFilter === tab;
            let activeStyle = {
              background: "var(--cyan)",
              color: "#ffffff"
            };
            if (tab === "Active") {
              activeStyle = { background: "var(--emerald)", color: "#ffffff" };
            } else if (tab === "Expiring Soon") {
              activeStyle = { background: "var(--amber)", color: "#ffffff" };
            } else if (tab === "Expired") {
              activeStyle = { background: "var(--rose)", color: "#ffffff" };
            }

            return (
              <button
                key={tab}
                type="button"
                onClick={() => setStatusFilter(tab)}
                style={{
                  padding: "8px 16px",
                  fontSize: "0.85rem",
                  fontWeight: "600",
                  borderRadius: "20px",
                  border: "none",
                  cursor: "pointer",
                  transition: "all var(--transition)",
                  whiteSpace: "nowrap",
                  ...(isActive ? activeStyle : {
                    background: "var(--bg-card)",
                    color: "var(--text-secondary)",
                    border: "1px solid var(--border)"
                  })
                }}
              >
                {tab}
              </button>
            );
          })}
        </div>

        {/* Content */}
        {loading ? (
          /* Skeleton */
          <div className="members-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="skeleton"
                style={{ height: "190px" }}
                aria-hidden="true"
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              {search || statusFilter !== "All" ? (
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: "var(--text-muted)" }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              ) : (
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: "var(--text-muted)" }}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              )}
            </span>
            <p>
              {search || statusFilter !== "All"
                ? `No members match the criteria`
                : "No members yet. Add your first member to get started!"}
            </p>
            {!search && statusFilter === "All" && (
              <button
                className="btn btn-primary"
                style={{ marginTop: "8px", display: "inline-flex", alignItems: "center", gap: "6px" }}
                onClick={() => setShowModal(true)}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add Member
              </button>
            )}
          </div>
        ) : (
          <div className="members-grid" role="list" aria-label="Members list">
            {filtered.map((m) => (
              <MemberCard
                key={m.id}
                member={m}
                onDelete={handleDelete}
                onRenew={setRenewMember}
                onEdit={setEditMember}
                onViewStats={setViewMemberStats}
                gymName={userProfile?.gymName}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {showModal && (
        <AddMemberModal
          adminGymId={currentAdminGymId}
          onClose={() => setShowModal(false)}
          onSaved={handleSaved}
        />
      )}

      {renewMember && (
        <RenewMemberModal
          member={renewMember}
          onClose={() => setRenewMember(null)}
          onSaved={() => setRenewMember(null)}
          planPricing={userProfile?.planPricing}
          gymName={userProfile?.gymName}
        />
      )}

      {editMember && (
        <EditMemberModal
          member={editMember}
          onClose={() => setEditMember(null)}
          onSaved={() => setEditMember(null)}
        />
      )}

      {viewMemberStats && (
        <MemberStatsModal
          member={viewMemberStats}
          onClose={() => setViewMemberStats(null)}
        />
      )}
    </Layout>
  );
}
