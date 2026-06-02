import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { loginUser, resetUserPassword } from "../firebase/auth";
import { getUserProfile, findUserByContact, updateDocument } from "../firebase/firestore";

export default function LoginPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Forgot Password state
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotStep, setForgotStep] = useState(1);
  const [forgotForm, setForgotForm] = useState({
    contact: "",
    otp: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [forgotError, setForgotError] = useState("");
  const [forgotSuccess, setForgotSuccess] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [generatedOtp, setGeneratedOtp] = useState("");
  const [foundUser, setFoundUser] = useState(null);

  const handleChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const input = form.email.trim();
      const phoneRegex = /^\+?[0-9\s-]{7,15}$/;
      let loginEmail = input;
      if (phoneRegex.test(input)) {
        const cleanPhone = input.replace(/\+/g, "").replace(/[^0-9]/g, "");
        loginEmail = `${cleanPhone}@flexpro.in`;
      }

      const fbUser = await loginUser(loginEmail, form.password);

      // Fetch the user's role profile to decide where to redirect
      const profile = await getUserProfile(fbUser.uid);

      if (profile?.role === "member") {
        navigate("/member-portal", { replace: true });
      } else if (profile?.role === "admin") {
        navigate("/super-admin", { replace: true });
      } else {
        // gymowner or legacy accounts
        navigate("/dashboard", { replace: true });
      }
    } catch (err) {
      setError(err.message.replace("Firebase: ", "").replace(/\(.*\)\.?/, "").trim());
    } finally {
      setLoading(false);
    }
  };

  const handleFindUser = async (e) => {
    e.preventDefault();
    setForgotError("");
    setForgotLoading(true);
    try {
      const user = await findUserByContact(forgotForm.contact);
      if (!user) {
        throw new Error("This contact number is not registered.");
      }
      if (!user.password) {
        throw new Error("This account was created before password recovery was enabled. Please contact your admin.");
      }

      setFoundUser(user);
      // Generate a random 6-digit OTP code
      const otpCode = String(Math.floor(100000 + Math.random() * 900000));
      setGeneratedOtp(otpCode);
      setForgotStep(2);
    } catch (err) {
      setForgotError(err.message);
    } finally {
      setForgotLoading(false);
    }
  };

  const handleVerifyOtp = (e) => {
    e.preventDefault();
    setForgotError("");
    if (forgotForm.otp !== generatedOtp) {
      setForgotError("Incorrect verification code. Please check the code and try again.");
      return;
    }
    setForgotStep(3);
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setForgotError("");
    if (forgotForm.newPassword.length < 6) {
      setForgotError("Password must be at least 6 characters.");
      return;
    }
    if (forgotForm.newPassword !== forgotForm.confirmPassword) {
      setForgotError("Passwords do not match.");
      return;
    }
    setForgotLoading(true);
    try {
      const cleanPhone = foundUser.contact.replace(/\+/g, "").replace(/[^0-9]/g, "");
      const userEmail = foundUser.email || `${cleanPhone}@flexpro.in`;

      // 1. Update in Firebase Auth
      await resetUserPassword(userEmail, foundUser.password, forgotForm.newPassword);

      // 2. Update the password field in Firestore USERS collection
      await updateDocument("users", foundUser.id, { password: forgotForm.newPassword });

      setForgotSuccess("Password reset successfully! You can now log in.");
      setForgotForm({ contact: "", otp: "", newPassword: "", confirmPassword: "" });
      setForgotStep(1);

      // Close modal after delay
      setTimeout(() => {
        setShowForgotModal(false);
        setForgotSuccess("");
      }, 2500);
    } catch (err) {
      setForgotError(err.message.replace("Firebase: ", "").replace(/\(.*\)\.?/, "").trim());
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <span className="logo-icon" style={{ display: "inline-flex", alignItems: "center", marginBottom: "8px" }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--cyan)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m6.5 6.5 11 11"/>
              <path d="m21 21-1-1"/>
              <path d="m3 3 1 1"/>
              <path d="m18 22 4-4"/>
              <path d="m2 6 4-4"/>
              <path d="m3 10 7-7"/>
              <path d="m14 21 7-7"/>
              <path d="M6.5 12.5 12.5 6.5"/>
              <path d="m11.5 17.5 6-6"/>
            </svg>
          </span>
          <h1 className="logo-text">FlexPro</h1>
          <p className="logo-sub">Gym Management</p>
        </div>

        <h2 className="auth-title">Welcome back</h2>
        <p className="auth-desc">Sign in to continue</p>

        {error && <div className="auth-error">{error}</div>}

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="login-email">Email address or Contact Number</label>
            <input
              id="login-email"
              type="text"
              name="email"
              placeholder=""
              value={form.email}
              onChange={handleChange}
              required
            />
          </div>
          <div className="form-group">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label htmlFor="login-password">Password</label>
              <button
                type="button"
                onClick={() => {
                  setShowForgotModal(true);
                  setForgotStep(1);
                  setForgotForm({ contact: "", otp: "", newPassword: "", confirmPassword: "" });
                  setForgotError("");
                  setForgotSuccess("");
                  setFoundUser(null);
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--cyan)",
                  fontSize: "0.82rem",
                  fontWeight: "600",
                  cursor: "pointer",
                  padding: 0,
                  outline: "none",
                  transition: "opacity 0.2s"
                }}
                onMouseOver={(e) => (e.target.style.opacity = 0.8)}
                onMouseOut={(e) => (e.target.style.opacity = 1)}
              >
                Forgot Password?
              </button>
            </div>
            <input
              id="login-password"
              type="password"
              name="password"
              placeholder="••••••••"
              value={form.password}
              onChange={handleChange}
              required
            />
          </div>
          <button
            id="login-submit"
            type="submit"
            className="btn btn-primary btn-full"
            disabled={loading}
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>

        <p className="auth-switch">
          Don&apos;t have an account?{" "}
          <Link to="/register">Create one</Link>
        </p>
      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={(e) => e.target === e.currentTarget && setShowForgotModal(false)}
        >
          <div className="modal-content" style={{ maxWidth: "440px" }}>
            <div className="modal-header">
              <h2 className="modal-title"> Reset Password</h2>
              <button
                className="modal-close"
                onClick={() => setShowForgotModal(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {forgotError && (
              <div className="auth-error" style={{ marginBottom: "18px" }}>
                {forgotError}
              </div>
            )}
            {forgotSuccess && (
              <div
                style={{
                  background: "rgba(16,185,129,0.12)",
                  border: "1px solid rgba(16,185,129,0.3)",
                  color: "var(--emerald)",
                  borderRadius: "var(--radius-sm)",
                  padding: "12px 14px",
                  fontSize: "0.875rem",
                  marginBottom: "18px",
                  textAlign: "center",
                }}
              >
                {forgotSuccess}
              </div>
            )}

            {forgotStep === 1 && (
              <form onSubmit={handleFindUser} className="modal-form">
                <p
                  style={{
                    fontSize: "0.88rem",
                    color: "var(--text-secondary)",
                    marginBottom: "8px",
                    lineHeight: "1.4",
                  }}
                >
                  Enter your registered contact number to verify your identity.
                </p>
                <div className="form-group">
                  <label htmlFor="forgot-contact">Contact Number</label>
                  <input
                    id="forgot-contact"
                    type="tel"
                    placeholder="e.g. +91 98765 43210"
                    value={forgotForm.contact}
                    onChange={(e) =>
                      setForgotForm((p) => ({ ...p, contact: e.target.value }))
                    }
                    required
                    autoFocus
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-primary btn-full"
                  disabled={forgotLoading}
                >
                  {forgotLoading ? "Verifying Phone Number…" : "Send Verification OTP"}
                </button>
              </form>
            )}

            {forgotStep === 2 && (
              <form onSubmit={handleVerifyOtp} className="modal-form">
                <p
                  style={{
                    fontSize: "0.88rem",
                    color: "var(--text-secondary)",
                    marginBottom: "8px",
                    lineHeight: "1.4",
                  }}
                >
                  We&apos;ve sent a 6-digit OTP code to{" "}
                  <strong style={{ color: "var(--text-primary)" }}>
                    {forgotForm.contact}
                  </strong>
                  .
                </p>

                {/* Simulated OTP Banner */}
                <div
                  style={{
                    background: "rgba(37,99,235,0.06)",
                    border: "1px solid rgba(37,99,235,0.18)",
                    borderRadius: "var(--radius-sm)",
                    padding: "12px 14px",
                    fontSize: "0.85rem",
                    color: "var(--text-secondary)",
                    marginBottom: "8px",
                    textAlign: "center",
                    lineHeight: "1.5",
                  }}
                >
                  Your OTP Code:{" "}
                  <strong
                    style={{
                      color: "var(--cyan)",
                      fontSize: "1.05rem",
                      letterSpacing: "1px",
                    }}
                  >
                    {generatedOtp}
                  </strong>
                  <div
                    style={{
                      fontSize: "0.74rem",
                      color: "var(--text-muted)",
                      marginTop: "4px",
                    }}
                  >
                    (Enter this code to verify phone ownership)
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="forgot-otp">Enter 6-Digit OTP</label>
                  <input
                    id="forgot-otp"
                    type="text"
                    maxLength={6}
                    placeholder="••••••"
                    value={forgotForm.otp}
                    onChange={(e) =>
                      setForgotForm((p) => ({
                        ...p,
                        otp: e.target.value.replace(/[^0-9]/g, ""),
                      }))
                    }
                    required
                    autoFocus
                    style={{
                      textAlign: "center",
                      fontSize: "1.4rem",
                      letterSpacing: "8px",
                      fontWeight: "bold",
                    }}
                  />
                </div>
                <button type="submit" className="btn btn-primary btn-full">
                  Verify OTP
                </button>
              </form>
            )}

            {forgotStep === 3 && (
              <form onSubmit={handleResetPassword} className="modal-form">
                <p
                  style={{
                    fontSize: "0.88rem",
                    color: "var(--text-secondary)",
                    marginBottom: "8px",
                    lineHeight: "1.4",
                  }}
                >
                  Resetting password for{" "}
                  <strong style={{ color: "var(--text-primary)" }}>
                    {foundUser?.name}
                  </strong>
                  .
                </p>
                <div className="form-group">
                  <label htmlFor="forgot-new-password">New Password</label>
                  <input
                    id="forgot-new-password"
                    type="password"
                    placeholder="Min 6 characters"
                    value={forgotForm.newPassword}
                    onChange={(e) =>
                      setForgotForm((p) => ({ ...p, newPassword: e.target.value }))
                    }
                    required
                    minLength={6}
                    autoFocus
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="forgot-confirm-password">Confirm New Password</label>
                  <input
                    id="forgot-confirm-password"
                    type="password"
                    placeholder="••••••••"
                    value={forgotForm.confirmPassword}
                    onChange={(e) =>
                      setForgotForm((p) => ({
                        ...p,
                        confirmPassword: e.target.value,
                      }))
                    }
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-primary btn-full"
                  disabled={forgotLoading}
                >
                  {forgotLoading ? "Resetting Password…" : "Update Password"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
