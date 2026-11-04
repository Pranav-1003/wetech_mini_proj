import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_USERS_URL } from "../api";
import Navbar from "../components/Navbar";
import "../App.css";

function Register({ currentUser, onLogout }) {
  const [formData, setFormData] = useState({
    username: "",
    emailId: "",
    age: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSuccessMessage("");
    setErrorMessage("");

    if (!formData.username.trim() || !formData.emailId.trim() || !formData.age || !formData.password) {
      setErrorMessage("Please fill in all fields (username, email ID, age, password).");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(API_USERS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: formData.username.trim(),
          emailId: formData.emailId.trim(),
          age: Number(formData.age),
          password: formData.password,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setErrorMessage(data.message || `Registration failed with status ${response.status}`);
        setLoading(false);
        return;
      }

      const registeredName = data.user?.username || formData.username.trim();
      setSuccessMessage(data.message || `Successfully registered! Welcome, ${registeredName}.`);
      setFormData({ username: "", emailId: "", age: "", password: "" });
      setLoading(false);
    } catch (err) {
      console.error("Registration error:", err);
      setErrorMessage("Unable to connect to backend server. Please verify backend is running.");
      setLoading(false);
    }
  };

  return (
    <div className="page-wrapper">
      <Navbar currentUser={currentUser} onLogout={onLogout} />

      <main className="content-container">
        <div className="auth-card">
          <div className="auth-card-tabs">
            <button
              type="button"
              className="auth-tab-btn"
              onClick={() => navigate("/login")}
            >
              Login
            </button>
            <button
              type="button"
              className="auth-tab-btn active"
              onClick={() => navigate("/register")}
            >
              Sign Up
            </button>
          </div>

          <h2>Create Account</h2>
          <p className="card-subtitle">
            Enter your details to register as a new user.
          </p>

          {successMessage && (
            <div className="alert alert-success" role="alert">
              <div>
                <strong>{successMessage}</strong>
                <p className="alert-sub">You can now proceed to login.</p>
                <button
                  type="button"
                  className="btn-primary mt-2"
                  onClick={() => navigate("/login")}
                >
                  Proceed to Login
                </button>
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="alert alert-error" role="alert">
              <div>{errorMessage}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-group">
              <label htmlFor="reg-username">
                Username <span className="req">*</span>
              </label>
              <input
                id="reg-username"
                name="username"
                type="text"
                placeholder="Enter username"
                value={formData.username}
                onChange={handleChange}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="reg-emailId">
                Email ID <span className="req">*</span>
              </label>
              <input
                id="reg-emailId"
                name="emailId"
                type="email"
                placeholder="user@example.com"
                value={formData.emailId}
                onChange={handleChange}
                required
              />
              <span className="field-hint">Must be a unique email address.</span>
            </div>

            <div className="form-group">
              <label htmlFor="reg-age">
                Age <span className="req">*</span>
              </label>
              <input
                id="reg-age"
                name="age"
                type="number"
                min="1"
                max="120"
                placeholder="Enter age"
                value={formData.age}
                onChange={handleChange}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="reg-password">
                Password <span className="req">*</span>
              </label>
              <input
                id="reg-password"
                name="password"
                type="password"
                placeholder="Enter password"
                value={formData.password}
                onChange={handleChange}
                required
              />
            </div>

            <button type="submit" className="btn-submit" disabled={loading}>
              {loading ? "Registering..." : "Register"}
            </button>
          </form>

          <div className="auth-footer-buttons">
            <span className="footer-label">Already have an account?</span>
            <button
              type="button"
              className="btn-secondary-action"
              onClick={() => navigate("/login")}
            >
              Go to Login
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

export default Register;
