import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API_BASE_URL, getItemId, getProductImage } from "../api";
import "../App.css";

function Home({ cart = [], setCart, addToCart }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [recentlyAdded, setRecentlyAdded] = useState({});
  const navigate = useNavigate();

  useEffect(() => {
    let ignore = false;

    fetch(API_BASE_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to fetch products from backend (${response.status} ${response.statusText})`);
        }
        return response.json();
      })
      .then((data) => {
        if (!ignore) {
          setProducts(Array.isArray(data) ? data : []);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          console.error("Error loading products:", err);
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
  }, []);

  function handleAddToCart(event, product) {
    event.stopPropagation();
    const pId = getItemId(product);

    if (addToCart) {
      addToCart(product);
    } else if (setCart) {
      const existingItem = cart.find((item) => getItemId(item) === pId);
      if (existingItem) {
        setCart(
          cart.map((item) =>
            getItemId(item) === pId
              ? { ...item, quantity: item.quantity + 1 }
              : item
          )
        );
      } else {
        setCart([...cart, { ...product, quantity: 1 }]);
      }
    }

    setRecentlyAdded((prev) => ({ ...prev, [pId]: true }));
    setTimeout(() => {
      setRecentlyAdded((prev) => ({ ...prev, [pId]: false }));
    }, 1200);
  }

  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="page">
      <div className="top-bar">
        <h1>Online Shopping App</h1>
        <div className="nav-actions">
          <Link to="/manage" className="nav-btn-manage">
            Manage Inventory
          </Link>
          <Link to="/cart" className="cart-btn">
            Items Added to Cart ({totalItems})
          </Link>
        </div>
      </div>

      {loading && (
        <div className="status-container">
          <p className="status-title">Loading products...</p>
          <p className="status-text">Fetching latest items from backend server...</p>
        </div>
      )}

      {error && !loading && (
        <div className="status-container">
          <p className="status-title">Unable to load products</p>
          <p className="status-text">{error}</p>
          <button
            className="btn-primary"
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && products.length === 0 && (
        <div className="status-container">
          <p className="status-title">No products found</p>
          <p className="status-text">The database currently has no products listed.</p>
        </div>
      )}

      {!loading && !error && products.length > 0 && (
        <div className="product-grid">
          {products.map((product) => {
            const pId = getItemId(product);
            const title = product.name || product.title || "Unnamed Product";
            const image = getProductImage(product);
            const isAdded = recentlyAdded[pId];

            return (
              <div
                className="product-card"
                key={pId}
                onClick={() => navigate("/product/" + pId)}
              >
                <div className="product-image-container">
                  <img
                    src={image}
                    alt={title}
                    className="product-image"
                  />
                </div>
                <div className="product-info">
                  {product.category && (
                    <span className="product-category">{product.category}</span>
                  )}
                  <h3 className="product-title" title={title}>
                    {title}
                  </h3>
                  <p className="product-price">
                    ${Number(product.price || 0).toFixed(2)}
                  </p>
                  <button
                    className={`add-cart-btn ${isAdded ? "added" : ""}`}
                    onClick={(event) => handleAddToCart(event, product)}
                  >
                    {isAdded ? "Added" : "Add to Cart"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default Home;
