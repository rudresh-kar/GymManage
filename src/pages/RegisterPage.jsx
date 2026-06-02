import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { registerUser } from "../firebase/auth";
import { createUserProfile, getAllGymOwners, addMember } from "../firebase/firestore";
import { BRAND_NAME } from "../constants";

const PLAN_DAYS = { "1 Month": 30, "3 Months": 90, "1 Year": 365 };

function getEndDate(startDate, plan) {
  if (!startDate || !plan) return "";
  const d = new Date(startDate);
  d.setDate(d.getDate() + (PLAN_DAYS[plan] || 30));
  return d.toISOString().split("T")[0];
}

export default function RegisterPage() {
  const navigate = useNavigate();

  // "member" or "gymowner"
  const [registerType, setRegisterType] = useState("gymowner");
  const [gyms, setGyms] = useState([]);

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirm: "",
    contact: "",
    gymId: "",
    plan: "1 Month",
    startDate: new Date().toISOString().split("T")[0],
    gymName: "",
    gymAddress: "",
  });

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Fetch gyms for members to select from
  useEffect(() => {
    getAllGymOwners()
      .then((data) => {
        setGyms(data);
        if (data.length > 0) {
          setForm((prev) => ({ ...prev, gymId: data[0].id }));
        }
      })
      .catch((err) => console.error("Error fetching gyms:", err));
  }, []);

  const handleChange = (e) => {
    let value = e.target.value;
    if (e.target.name === "contact") {
      value = value.replace(/[^0-9]/g, "").slice(0, 10);
    }
    setForm((prev) => ({ ...prev, [e.target.name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!form.name.trim()) return setError("Full name is required.");
    if (!form.contact.trim()) return setError("Contact number is required.");
    const cleanPhone = form.contact.replace(/[^0-9]/g, "");
    if (cleanPhone.length !== 10) return setError("Contact number must be exactly 10 digits.");
    if (form.password.length < 6) return setError("Password must be at least 6 characters.");
    if (form.password !== form.confirm) return setError("Passwords do not match.");

    if (registerType === "member") {
      if (!form.gymId) return setError("Please select a gym to register with.");
      if (!form.startDate) return setError("Start date is required.");
    } else {
      if (!form.gymName.trim()) return setError("Gym name is required.");
      if (!form.gymAddress.trim()) return setError("Gym location/address is required.");
    }

    setLoading(true);
    try {
      const cleanPhone = form.contact.replace(/[^0-9]/g, "");
      const registrationEmail = form.email.trim() || `${cleanPhone}@flexpro.in`;

      const fbUser = await registerUser(registrationEmail, form.password, form.name.trim());

      if (registerType === "gymowner") {
        // Create user profile for Gym Owner
        await createUserProfile(fbUser.uid, {
          role: "gymowner",
          gymId: fbUser.uid,
          name: form.name.trim(),
          email: registrationEmail,
          contact: cleanPhone,
          gymName: form.gymName.trim(),
          gymAddress: form.gymAddress.trim(),
          password: form.password // Saved for phone-based password reset
        });
        navigate("/dashboard");
      } else {
        // 1. Create member entry in Firestore members collection
        const memberId = await addMember({
          name: form.name.trim(),
          contact: form.contact.trim(),
          email: registrationEmail,
          plan: form.plan,
          startDate: form.startDate,
          endDate: getEndDate(form.startDate, form.plan),
          status: "active",
          uid: fbUser.uid,
          gymId: form.gymId,
        });

        // 2. Create user profile in users collection for authorization checks
        await createUserProfile(fbUser.uid, {
          role: "member",
          memberId,
          gymId: form.gymId,
          name: form.name.trim(),
          email: registrationEmail,
          contact: cleanPhone,
          password: form.password // Saved for phone-based password reset
        });
        navigate("/member-portal");
      }
    } catch (err) {
      console.error("Registration error:", err);
      setError(err.message.replace("Firebase: ", "").replace(/\(.*\)\.?/, "").trim());
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ maxWidth: "480px" }}>
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
          <h1 className="logo-text">{BRAND_NAME}</h1>
          <p className="logo-sub">Gym Management</p>
        </div>

        <h2 className="auth-title">Create account</h2>
        <p className="auth-desc">Select your role and fill in details below</p>

        {error && <div className="auth-error">{error}</div>}

        <form className="auth-form" onSubmit={handleSubmit}>
          {/* Role Dropdown */}
          <div className="form-group">
            <label htmlFor="registerType">Register As</label>
            <select
              id="registerType"
              name="registerType"
              className="form-select"
              value={registerType}
              onChange={(e) => setRegisterType(e.target.value)}
            >
              {/* <option value="member">Member of Gym</option> */}
              <option value="gymowner">Gym Owner</option>
            </select>
          </div>

          {/* Full Name */}
          <div className="form-group">
            <label htmlFor="reg-name">Full name</label>
            <input
              id="reg-name"
              type="text"
              name="name"
              placeholder="e.g. Akshay Kumar"
              value={form.name}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="reg-contact">Contact Number</label>
            <input
              id="reg-contact"
              type="tel"
              name="contact"
              placeholder="e.g. 9876543210"
              value={form.contact}
              onChange={handleChange}
              required
            />
          </div>

          {/* Email */}
          <div className="form-group">
            <label htmlFor="reg-email">Email address (Optional)</label>
            <input
              id="reg-email"
              type="email"
              name="email"
              placeholder="Optional: you@gmail.com"
              value={form.email}
              onChange={handleChange}
            />
          </div>

          {/* Dynamic Gym Selection - Members Only */}
          {registerType === "member" && (
            <>
              <div className="form-group">
                <label htmlFor="reg-gymId">Select Gym</label>
                {gyms.length === 0 ? (
                  <p style={{ fontSize: "0.85rem", color: "var(--rose)", margin: "4px 0", display: "flex", alignItems: "center", gap: "6px" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    No gyms registered on the platform yet. Gym Owners must register first.
                  </p>
                ) : (
                  <select
                    id="reg-gymId"
                    name="gymId"
                    className="form-select"
                    value={form.gymId}
                    onChange={handleChange}
                    required
                  >
                    {gyms.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.gymName || g.name} ({g.gymAddress || "No location"})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Plan Type */}
              <div className="form-group">
                <label htmlFor="reg-plan">Membership Plan</label>
                <select
                  id="reg-plan"
                  name="plan"
                  className="form-select"
                  value={form.plan}
                  onChange={handleChange}
                >
                  <option value="1 Month">1 Month — 30 days</option>
                  <option value="3 Months">3 Months — 90 days</option>
                  <option value="1 Year">1 Year — 365 days</option>
                </select>
              </div>

              {/* Start Date */}
              <div className="form-group">
                <label htmlFor="reg-startDate">Start Date</label>
                <input
                  id="reg-startDate"
                  type="date"
                  name="startDate"
                  value={form.startDate}
                  onChange={handleChange}
                  required
                  style={{ colorScheme: "light" }}
                />
              </div>
            </>
          )}

          {/* Gym Details - Gym Owners Only */}
          {registerType === "gymowner" && (
            <>
              <div className="form-group">
                <label htmlFor="reg-gymName">Gym Name</label>
                <input
                  id="reg-gymName"
                  type="text"
                  name="gymName"
                  placeholder="e.g. Titan Fitness Club"
                  value={form.gymName}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="reg-gymAddress">Gym Location / Address</label>
                <input
                  id="reg-gymAddress"
                  type="text"
                  name="gymAddress"
                  placeholder="e.g. 1st Floor, City Center Plaza, New Delhi"
                  value={form.gymAddress}
                  onChange={handleChange}
                  required
                />
              </div>
            </>
          )}

          {/* Password */}
          <div className="form-group">
            <label htmlFor="reg-password">Password</label>
            <input
              id="reg-password"
              type="password"
              name="password"
              placeholder="Min 6 characters"
              value={form.password}
              onChange={handleChange}
              required
              minLength={6}
            />
          </div>

          {/* Confirm Password */}
          <div className="form-group">
            <label htmlFor="reg-confirm">Confirm password</label>
            <input
              id="reg-confirm"
              type="password"
              name="confirm"
              placeholder="••••••••"
              value={form.confirm}
              onChange={handleChange}
              required
            />
          </div>

          <button
            id="register-submit"
            type="submit"
            className="btn btn-primary btn-full"
            disabled={loading || (registerType === "member" && gyms.length === 0)}
          >
            {loading ? "Creating account…" : "Create Account"}
          </button>
        </form>

        <p className="auth-switch">
          Already have an account?{" "}
          <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
