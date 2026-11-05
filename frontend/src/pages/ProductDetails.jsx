import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { API_BASE_URL, API_BASE, getAuthHeaders, getProductImage } from "../api";
import "../App.css";

function ProductDetails({ cart = [], addToCart }) {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [isAdded, setIsAdded] = useState(false);
  const [reserveLoading, setReserveLoading] = useState(false);
  const [reserveMsg, setReserveMsg] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    let ignore = false;

    fetch(`${API_BASE_URL}/${id}`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load product: status ${response.status} (${response.statusText})`);
        }
        return response.json();
      })
      .then((data) => {
        if (!ignore) {
          if (!data || (!data.productId && !data.id && !data._id)) {
            throw new Error("Product not found in backend.");
          }
          setProduct(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          console.error("Error loading product details:", err);
          setError(
            err.message.includes("Failed to fetch")
              ? "Cannot connect to backend server at http://localhost:3000. Please ensure the backend server is running."
              : err.message
          );
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [id]);

  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  const handleReserve = async () => {
    if (!product) return;
    setReserveLoading(true);
    setReserveMsg(null);
    try {
      const res = await fetch(`${API_BASE}/api/reservations`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          productId: product.productId || product._id,
          quantity,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Reservation failed");
      setReserveMsg({ type: "success", text: data.message });
      setTimeout(() => navigate("/reservations"), 2000);
    } catch (err) {
      setReserveMsg({ type: "error", text: err.message });
    } finally {
      setReserveLoading(false);
      setTimeout(() => setReserveMsg(null), 5000);
    }
  };

  const handleAddToCart = () => {
    if (!product || !addToCart) return;
    addToCart(product, quantity);
    setIsAdded(true);
    setTimeout(() => setIsAdded(false), 1500);
  };

  const title = product ? product.name || product.title || "Product Details" : "";
  const image = getProductImage(product);
  const currentStock = product ? (product.availableStock !== undefined ? product.availableStock : (product.quantity ?? 0)) : 0;
  const isOutOfStock = currentStock <= 0;

  return (
    <div className="page">
      <div className="details-page-header">
        <Link to="/" className="back-btn">
          Back to Products
        </Link>
        <div className="nav-actions">
          <Link to={`/edit-product/${id}`} className="btn-secondary">
            Edit Product
          </Link>
          <Link to="/manage" className="btn-secondary">
            Inventory
          </Link>
          <Link to="/cart" className="cart-btn">
            Cart ({totalItems})
          </Link>
        </div>
      </div>

      {loading && (
        <div className="status-container">
          <p className="status-title">Loading product details...</p>
          <p className="status-text">Fetching details from backend server...</p>
        </div>
      )}

      {error && !loading && (
        <div className="status-container">
          <p className="status-title">Product Error</p>
          <p className="status-text">{error}</p>
          <Link to="/" className="btn-primary">
            Back to Home
          </Link>
        </div>
      )}

      {!loading && !error && product && (
        <div className="details-card">
          <div className="details-image-container">
            <img
              src={image}
              alt={title}
              className="details-image"
            />
          </div>

          <div className="details-content">
            {product.category && (
              <span className="details-category-badge">{product.category}</span>
            )}
            <h2 className="details-title">{title}</h2>

            <p style={{ color: "#64748b", fontSize: "14px", marginBottom: "6px" }}>
              <strong>Product ID:</strong> {product.productId || product._id || product.id}
            </p>

            <p style={{ fontSize: "14px", marginBottom: "10px" }}>
              <strong>Available Stock:</strong>{" "}
              <span
                style={{
                  fontWeight: "bold",
                  color: (product.availableStock ?? product.quantity ?? 0) > 0 ? "#1b3b2b" : "#b91c1c",
                }}
              >
                {product.availableStock !== undefined ? product.availableStock : (product.quantity ?? 0)} units
              </span>
            </p>

            {product.rating && (
              <p className="details-rating">
                Rating: {product.rating.rate} / 5 ({product.rating.count} customer reviews)
              </p>
            )}

            <p className="details-price">${Number(product.price || 0).toFixed(2)}</p>

            {product.description && (
              <p className="details-description">{product.description}</p>
            )}

            <div className="details-actions">
              <div className="cart-controls">
                <button
                  className="qty-btn"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  aria-label="Decrease quantity"
                  disabled={isOutOfStock}
                >
                  -
                </button>
                <span className="qty-display">{quantity}</span>
                <button
                  className="qty-btn"
                  onClick={() => setQuantity((q) => (currentStock > 0 ? Math.min(currentStock, q + 1) : q + 1))}
                  aria-label="Increase quantity"
                  disabled={isOutOfStock || quantity >= currentStock}
                >
                  +
                </button>
              </div>

              <button
                className={`add-cart-btn ${isAdded ? "added" : ""}`}
                onClick={handleAddToCart}
                style={{ maxWidth: "200px" }}
                disabled={isOutOfStock}
              >
                {isOutOfStock ? "Out of Stock" : isAdded ? "Added to Cart" : "Add to Cart"}
              </button>
              <button
                className="btn-secondary"
                onClick={handleReserve}
                disabled={reserveLoading || isOutOfStock}
                style={{ maxWidth: "200px" }}
              >
                {isOutOfStock
                  ? "Unavailable"
                  : reserveLoading
                  ? "Reserving..."
                  : "Reserve Product"}
              </button>
            </div>
            {reserveMsg && (
              <div className={`alert ${reserveMsg.type === "success" ? "alert-success" : "alert-error"}`} style={{ marginTop: "16px" }}>
                {reserveMsg.text}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default ProductDetails;
