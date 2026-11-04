import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_LOGIN_URL } from "../api";
import Navbar from "../components/Navbar";
import "../App.css";

function Login({ currentUser, setCurrentUser, onLogout }) {
  const [formData, setFormData] = useState({
    emailId: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    if (!formData.emailId.trim() || !formData.password) {
      setErrorMessage("Please enter both email ID and password.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(API_LOGIN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          emailId: formData.emailId.trim(),
          password: formData.password,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setLoading(false);
        setErrorMessage(data.message || `Login failed (HTTP ${response.status})`);
        return;
      }

      setLoading(false);
      setSuccessMessage(`Welcome back, ${data.user.username}! Redirecting to Products...`);

      localStorage.setItem("lab8_token", data.token);
      localStorage.setItem("lab8_user", JSON.stringify(data.user));

      if (setCurrentUser) {
        setCurrentUser(data.user);
      }

      setTimeout(() => {
        navigate("/products");
      }, 800);
    } catch (err) {
      console.error("Login request error:", err);
      setLoading(false);
      setErrorMessage("Unable to connect to backend server. Please verify backend is running.");
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
              className="auth-tab-btn active"
              onClick={() => navigate("/login")}
            >
              Login
            </button>
            <button
              type="button"
              className="auth-tab-btn"
              onClick={() => navigate("/register")}
            >
              Sign Up
            </button>
          </div>

          <h2>Account Login</h2>
          <p className="card-subtitle">
            Enter your registered email ID and password.
          </p>

          {successMessage && (
            <div className="alert alert-success" role="alert">
              <div>{successMessage}</div>
            </div>
          )}

          {errorMessage && (
            <div className="alert alert-error" role="alert">
              <div>
                <strong>{errorMessage}</strong>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-group">
              <label htmlFor="login-emailId">
                Email ID <span className="req">*</span>
              </label>
              <input
                id="login-emailId"
                name="emailId"
                type="email"
                placeholder="registered-user@example.com"
                value={formData.emailId}
                onChange={handleChange}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="login-password">
                Password <span className="req">*</span>
              </label>
              <input
                id="login-password"
                name="password"
                type="password"
                placeholder="Enter password"
                value={formData.password}
                onChange={handleChange}
                required
              />
            </div>

            <button type="submit" className="btn-submit" disabled={loading}>
              {loading ? "Validating..." : "Sign In"}
            </button>
          </form>

          <div className="auth-footer-buttons">
            <span className="footer-label">Don't have an account yet?</span>
            <button
              type="button"
              className="btn-secondary-action"
              onClick={() => navigate("/register")}
            >
              Create New Account
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

export default Login;
