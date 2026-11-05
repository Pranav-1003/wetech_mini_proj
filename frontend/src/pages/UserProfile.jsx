import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { API_USERS_URL, getAuthHeaders } from "../api";
import Navbar from "../components/Navbar";
import "../App.css";

function UserProfile({ currentUser, setCurrentUser, onLogout }) {
  const navigate = useNavigate();

  const emailId = currentUser?.emailId || "";

  const [activeAction, setActiveAction] = useState("complete");

  const [putData, setPutData] = useState({
    username: currentUser?.username || "",
    age: currentUser?.age || "",
    password: ""
  });

  const [patchData, setPatchData] = useState({
    username: "",
    age: "",
    password: ""
  });
  const [patchFieldsToUpdate, setPatchFieldsToUpdate] = useState({
    username: true,
    age: false,
    password: false
  });

  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (currentUser) {
      setPutData((prev) => ({
        ...prev,
        username: currentUser.username || prev.username,
        age: currentUser.age || prev.age
      }));
    }
  }, [currentUser]);

  if (!currentUser) {
    return (
      <div className="page-wrapper">
        <Navbar currentUser={currentUser} onLogout={onLogout} />
        <main className="content-container">
          <div className="plain-card">
            <h2>User Profile</h2>
            <p className="mt-2">Please log in to manage your profile.</p>
            <button
              type="button"
              className="btn-primary mt-4"
              onClick={() => navigate("/login")}>
              
              Go to Login
            </button>
          </div>
        </main>
      </div>);

  }

  const handleCompleteUpdate = async (e) => {
    e.preventDefault();
    if (!putData.username.trim() || !putData.age || !putData.password) {
      alert("Please fill in all fields (username, age, and password).");
      return;
    }

    setLoading(true);
    setFeedback(null);

    const targetUrl = `${API_USERS_URL}?emailId=${encodeURIComponent(emailId)}`;
    const payload = {
      username: putData.username.trim(),
      age: Number(putData.age),
      password: putData.password
    };

    try {
      const response = await fetch(targetUrl, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });

      const result = await response.json().catch(() => ({}));

      if (response.ok && result.user) {
        const updatedUser = { ...currentUser, ...result.user };
        localStorage.setItem("lab8_user", JSON.stringify(updatedUser));
        if (setCurrentUser) setCurrentUser(updatedUser);
        setPutData((prev) => ({ ...prev, password: "" }));
        setFeedback({
          success: true,
          message: result.message || "Complete profile updated successfully."
        });
      } else {
        setFeedback({
          success: false,
          message: result.message || "Failed to update profile."
        });
      }
    } catch (err) {
      setFeedback({
        success: false,
        message: err.message || "Network request failed."
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSelectedUpdate = async (e) => {
    e.preventDefault();

    const payload = {};
    if (patchFieldsToUpdate.username && patchData.username.trim()) {
      payload.username = patchData.username.trim();
    }
    if (patchFieldsToUpdate.age && patchData.age) {
      payload.age = Number(patchData.age);
    }
    if (patchFieldsToUpdate.password && patchData.password) {
      payload.password = patchData.password;
    }

    if (Object.keys(payload).length === 0) {
      alert("Please check at least one field and provide a value to update.");
      return;
    }

    setLoading(true);
    setFeedback(null);

    const targetUrl = `${API_USERS_URL}?emailId=${encodeURIComponent(emailId)}`;

    try {
      const response = await fetch(targetUrl, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });

      const result = await response.json().catch(() => ({}));

      if (response.ok && result.user) {
        const updatedUser = { ...currentUser, ...result.user };
        localStorage.setItem("lab8_user", JSON.stringify(updatedUser));
        if (setCurrentUser) setCurrentUser(updatedUser);
        setPatchData({ username: "", age: "", password: "" });
        setFeedback({
          success: true,
          message: result.message || "Selected fields updated successfully."
        });
      } else {
        setFeedback({
          success: false,
          message: result.message || "Failed to update selected fields."
        });
      }
    } catch (err) {
      setFeedback({
        success: false,
        message: err.message || "Network request failed."
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    const confirmed = window.confirm(
      "Are you sure you want to delete your registration record?"
    );
    if (!confirmed) return;

    setLoading(true);
    setFeedback(null);

    const targetUrl = `${API_USERS_URL}?emailId=${encodeURIComponent(emailId)}`;

    try {
      const response = await fetch(targetUrl, {
        method: "DELETE",
        headers: getAuthHeaders()
      });

      const result = await response.json().catch(() => ({}));

      if (response.ok) {
        setFeedback({
          success: true,
          message: result.message || "Account deleted successfully. Logging out..."
        });
        setTimeout(() => {
          if (onLogout) onLogout();
          navigate("/register");
        }, 1200);
      } else {
        setFeedback({
          success: false,
          message: result.message || "Failed to delete account."
        });
      }
    } catch (err) {
      setFeedback({
        success: false,
        message: err.message || "Network request failed."
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-wrapper">
      <Navbar currentUser={currentUser} onLogout={onLogout} />

      <main className="content-container">
        <div className="page-header-banner">
          <div>
            <h2>User Profile</h2>
            <p className="subtext">
              Targeted to logged-in user: <strong>{currentUser.username}</strong> ({currentUser.emailId})
            </p>
          </div>
        </div>

        {}
        <div className="profile-action-tabs">
          <button
            type="button"
            className={`profile-action-tab ${activeAction === "complete" ? "active" : ""}`}
            onClick={() => {
              setActiveAction("complete");
              setFeedback(null);
            }}>
            
            Update Complete Profile
          </button>
          <button
            type="button"
            className={`profile-action-tab ${activeAction === "selected" ? "active" : ""}`}
            onClick={() => {
              setActiveAction("selected");
              setFeedback(null);
            }}>
            
            Update Selected Fields
          </button>
          <button
            type="button"
            className={`profile-action-tab tab-danger ${activeAction === "delete" ? "active-danger" : ""}`}
            onClick={() => {
              setActiveAction("delete");
              setFeedback(null);
            }}>
            
            Delete Account
          </button>
        </div>

        {}
        {feedback &&
        <div className="plain-feedback-box">
            {feedback.message}
          </div>
        }

        {}
        {activeAction === "complete" &&
        <div className="plain-card">
            <h3>Update Complete Profile</h3>
            <p className="plain-card-sub">
              Update all profile fields for {currentUser.emailId}.
            </p>

            <form onSubmit={handleCompleteUpdate} className="plain-form">
              <div className="form-group">
                <label>Username</label>
                <input
                type="text"
                value={putData.username}
                onChange={(e) =>
                setPutData((prev) => ({ ...prev, username: e.target.value }))
                }
                placeholder="Enter username"
                required />
              
              </div>

              <div className="form-group">
                <label>Age</label>
                <input
                type="number"
                min="1"
                max="120"
                value={putData.age}
                onChange={(e) =>
                setPutData((prev) => ({ ...prev, age: e.target.value }))
                }
                placeholder="Enter age"
                required />
              
              </div>

              <div className="form-group">
                <label>Password</label>
                <input
                type="password"
                value={putData.password}
                onChange={(e) =>
                setPutData((prev) => ({ ...prev, password: e.target.value }))
                }
                placeholder="Enter password"
                required />
              
              </div>

              <button
              type="submit"
              className="btn-primary mt-2"
              disabled={loading}>
              
                {loading ? "Saving..." : "Save Changes"}
              </button>
            </form>
          </div>
        }

        {}
        {activeAction === "selected" &&
        <div className="plain-card">
            <h3>Update Selected Fields</h3>
            <p className="plain-card-sub">
              Select specific fields to update for {currentUser.emailId}.
            </p>

            <form onSubmit={handleSelectedUpdate} className="plain-form">
              <div className="plain-field-row">
                <label className="plain-checkbox-label">
                  <input
                  type="checkbox"
                  checked={patchFieldsToUpdate.username}
                  onChange={(e) =>
                  setPatchFieldsToUpdate((p) => ({
                    ...p,
                    username: e.target.checked
                  }))
                  } />
                
                  <span>Username</span>
                </label>
                <input
                type="text"
                disabled={!patchFieldsToUpdate.username}
                value={patchData.username}
                onChange={(e) =>
                setPatchData((prev) => ({ ...prev, username: e.target.value }))
                }
                placeholder="New Username"
                className="plain-input" />
              
              </div>

              <div className="plain-field-row">
                <label className="plain-checkbox-label">
                  <input
                  type="checkbox"
                  checked={patchFieldsToUpdate.age}
                  onChange={(e) =>
                  setPatchFieldsToUpdate((p) => ({
                    ...p,
                    age: e.target.checked
                  }))
                  } />
                
                  <span>Age</span>
                </label>
                <input
                type="number"
                min="1"
                max="120"
                disabled={!patchFieldsToUpdate.age}
                value={patchData.age}
                onChange={(e) =>
                setPatchData((prev) => ({ ...prev, age: e.target.value }))
                }
                placeholder="New Age"
                className="plain-input" />
              
              </div>

              <div className="plain-field-row">
                <label className="plain-checkbox-label">
                  <input
                  type="checkbox"
                  checked={patchFieldsToUpdate.password}
                  onChange={(e) =>
                  setPatchFieldsToUpdate((p) => ({
                    ...p,
                    password: e.target.checked
                  }))
                  } />
                
                  <span>Password</span>
                </label>
                <input
                type="password"
                disabled={!patchFieldsToUpdate.password}
                value={patchData.password}
                onChange={(e) =>
                setPatchData((prev) => ({ ...prev, password: e.target.value }))
                }
                placeholder="New Password"
                className="plain-input" />
              
              </div>

              <button
              type="submit"
              className="btn-primary mt-2"
              disabled={loading}>
              
                {loading ? "Updating..." : "Update Selected Fields"}
              </button>
            </form>
          </div>
        }

        {}
        {activeAction === "delete" &&
        <div className="plain-card">
            <h3>Delete Account</h3>
            <p className="plain-card-sub">
              Permanently remove the registration record for {currentUser.emailId}.
            </p>

            <div className="plain-action-actions">
              <button
              type="button"
              onClick={handleDeleteAccount}
              className="btn-danger"
              disabled={loading}>
              
                {loading ? "Deleting..." : "Delete Account"}
              </button>
            </div>
          </div>
        }
      </main>
    </div>);

}

export default UserProfile;