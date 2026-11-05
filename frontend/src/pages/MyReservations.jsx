import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { API_BASE, getAuthHeaders, getProductImage } from "../api";
import Navbar from "../components/Navbar";
import "../App.css";

function MyReservations({ currentUser, onLogout, cart = [] }) {
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notification, setNotification] = useState(null);

  const totalCartCount = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);

  const fetchReservations = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/reservations/my`, {
        headers: getAuthHeaders()
      });
      if (!res.ok) throw new Error("Failed to fetch reservations");
      const data = await res.json();
      setReservations(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReservations();
    const interval = setInterval(fetchReservations, 30000);
    return () => clearInterval(interval);
  }, [fetchReservations]);

  const handleCancel = async (id) => {
    if (!window.confirm("Are you sure you want to cancel this reservation?")) return;
    try {
      const res = await fetch(`${API_BASE}/api/reservations/${id}`, {
        method: "DELETE",
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to cancel");
      setNotification({ type: "success", text: data.message });
      fetchReservations();
    } catch (err) {
      setNotification({ type: "error", text: err.message });
    }
    setTimeout(() => setNotification(null), 4000);
  };

  const handleComplete = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/api/reservations/${id}/complete`, {
        method: "POST",
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to complete");
      setNotification({ type: "success", text: data.message });
      fetchReservations();
    } catch (err) {
      setNotification({ type: "error", text: err.message });
    }
    setTimeout(() => setNotification(null), 4000);
  };

  return (
    <div className="page-wrapper">
      <Navbar currentUser={currentUser} onLogout={onLogout} cartCount={totalCartCount} />

      <main className="content-container">
        <div className="page-header-banner">
          <div>
            <h2>My Reservations</h2>
            <p className="subtext">View and manage your product reservations.</p>
          </div>
          <Link to="/products" className="btn-secondary">
            Browse Products
          </Link>
        </div>

        {notification &&
        <div className={`alert ${notification.type === "success" ? "alert-success" : "alert-error"}`}>
            {notification.text}
          </div>
        }

        {loading &&
        <div className="status-container">
            <div className="spinner"></div>
            <p className="status-title">Loading reservations...</p>
          </div>
        }

        {error && !loading &&
        <div className="status-container error-state">
            <p className="status-title">Error</p>
            <p className="status-text">{error}</p>
            <button className="btn-primary" onClick={fetchReservations}>Retry</button>
          </div>
        }

        {!loading && !error && reservations.length === 0 &&
        <div className="status-container">
            <p className="status-title">No Reservations</p>
            <p className="status-text">You haven't reserved any products yet.</p>
            <Link to="/products" className="btn-primary mt-2">Browse Products</Link>
          </div>
        }

        {!loading && !error && reservations.length > 0 &&
        <div className="reservations-list">
            {reservations.map((r) =>
          <ReservationCard
            key={r._id}
            reservation={r}
            onCancel={handleCancel}
            onComplete={handleComplete}
            onExpire={fetchReservations} />

          )}
          </div>
        }
      </main>
    </div>);

}

function ReservationCard({ reservation, onCancel, onComplete, onExpire }) {
  const [expiredLocal, setExpiredLocal] = useState(false);
  const r = reservation;
  const product = r.product;
  const image = getProductImage(product);
  const productName = product ? product.productName || product.name || "Unknown" : "Unknown Product";
  const productPrice = product ? Number(product.productPrice ?? product.price ?? 0) : 0;

  const isTimeOver = expiredLocal || new Date(r.expiresAt) <= new Date();
  const isActive = r.status === "active" && !isTimeOver;
  const displayStatus = isActive ? "active" : r.status === "completed" ? "completed" : r.status === "cancelled" ? "cancelled" : "expired";

  const handleTimerExpire = () => {
    setExpiredLocal(true);
    if (onExpire) {
      setTimeout(onExpire, 1000);
    }
  };

  return (
    <div className={`reservation-card reservation-${displayStatus}`}>
      <div className="reservation-image-container">
        <img src={image} alt={productName} className="reservation-image" />
      </div>

      <div className="reservation-details">
        <div className="reservation-header">
          <h3 className="reservation-product-name">{productName}</h3>
          <span className={`reservation-status-badge status-${displayStatus}`}>
            {displayStatus.charAt(0).toUpperCase() + displayStatus.slice(1)}
          </span>
        </div>

        <div className="reservation-meta">
          <span>Quantity: <strong>{r.quantity}</strong></span>
          <span>Unit Price: <strong>${productPrice.toFixed(2)}</strong></span>
          <span>Total: <strong>${(productPrice * r.quantity).toFixed(2)}</strong></span>
        </div>

        {isActive ?
        <CountdownTimer expiresAt={r.expiresAt} onExpire={handleTimerExpire} /> :
        displayStatus === "expired" ?
        <div className="countdown-timer countdown-urgent">
            <span className="countdown-label">Status:</span>
            <span className="countdown-value">Expired</span>
          </div> :
        null}

        <p className="reservation-date">
          Reserved: {new Date(r.createdAt).toLocaleString()}
        </p>

        {isActive &&
        <div className="reservation-actions">
            <button className="btn-primary" onClick={() => onComplete(r._id)}>
              Complete Purchase
            </button>
            <button className="btn-danger" onClick={() => onCancel(r._id)}>
              Cancel Reservation
            </button>
          </div>
        }
      </div>
    </div>);

}

function CountdownTimer({ expiresAt, onExpire }) {
  const [timeLeft, setTimeLeft] = useState("");
  const [isUrgent, setIsUrgent] = useState(false);

  useEffect(() => {
    const update = () => {
      const now = new Date().getTime();
      const end = new Date(expiresAt).getTime();
      const diff = end - now;

      if (diff <= 0) {
        setTimeLeft("Expired");
        setIsUrgent(true);
        if (onExpire) onExpire();
        return;
      }

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor(diff % 60000 / 1000);
      setTimeLeft(`${minutes}m ${seconds.toString().padStart(2, "0")}s`);
      setIsUrgent(diff < 2 * 60 * 1000);
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, onExpire]);

  return (
    <div className={`countdown-timer ${isUrgent ? "countdown-urgent" : ""}`}>
      <span className="countdown-label">Time Remaining:</span>
      <span className="countdown-value">{timeLeft}</span>
    </div>);

}

export default MyReservations;