import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { API_BASE_URL, getProductImage } from "../api";
import "../App.css";

function ProductDetails({ cart = [], addToCart }) {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [isAdded, setIsAdded] = useState(false);

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

  const handleAddToCart = () => {
    if (!product || !addToCart) return;
    addToCart(product, quantity);
    setIsAdded(true);
    setTimeout(() => setIsAdded(false), 1500);
  };

  const title = product ? product.name || product.title || "Product Details" : "";
  const image = getProductImage(product);

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

            <p style={{ color: "#64748b", fontSize: "14px", marginBottom: "10px" }}>
              <strong>Product ID:</strong> {product.productId || product._id || product.id}
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
                >
                  -
                </button>
                <span className="qty-display">{quantity}</span>
                <button
                  className="qty-btn"
                  onClick={() => setQuantity((q) => q + 1)}
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>

              <button
                className={`add-cart-btn ${isAdded ? "added" : ""}`}
                onClick={handleAddToCart}
                style={{ maxWidth: "200px" }}
              >
                {isAdded ? "Added to Cart" : "Add to Cart"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProductDetails;
