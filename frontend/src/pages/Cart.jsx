import { useState } from "react";
import { Link } from "react-router-dom";
import { getItemId, getProductImage, API_ORDERS_URL, getAuthHeaders } from "../api";
import "../App.css";

function Cart({ cart = [], updateQuantity, removeFromCart, clearCart }) {
  const [orderStatus, setOrderStatus] = useState(null); // { type: "success"|"error", message }
  const [placing, setPlacing] = useState(false);

  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  const handleCheckout = async () => {
    if (cart.length === 0) return;

    setPlacing(true);
    setOrderStatus(null);

    const items = cart.map((item) => ({
      productId: getItemId(item),
      quantity: item.quantity,
    }));

    try {
      const response = await fetch(API_ORDERS_URL, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ items }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || `Order failed (HTTP ${response.status})`);
      }

      setOrderStatus({ type: "success", message: data.message || "Order placed successfully!" });
      if (clearCart) clearCart();
    } catch (err) {
      setOrderStatus({
        type: "error",
        message: err.message.includes("Failed to fetch")
          ? "Cannot connect to backend server. Please ensure it is running."
          : err.message,
      });
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div className="page">
      <div className="cart-header">
        <Link to="/" className="back-btn">
          Continue Shopping
        </Link>
        <h2 className="cart-title">Shopping Cart ({totalItems})</h2>
      </div>

      {orderStatus && (
        <div
          className={`alert ${
            orderStatus.type === "success" ? "alert-success" : "alert-error"
          }`}
          style={{ marginBottom: "16px" }}
        >
          <span>{orderStatus.message}</span>
        </div>
      )}

      {cart.length === 0 && !orderStatus ? (
        <div className="status-container">
          <p className="status-title">Your Cart is Empty</p>
          <p className="status-text">
            Looks like you haven't added any products to your cart yet.
          </p>
          <Link to="/" className="btn-primary">
            Explore Products
          </Link>
        </div>
      ) : (
        <div className="cart-layout">
          <div className="cart-list">
            {cart.map((item) => {
              const pId = getItemId(item);
              const title = item.name || item.title || "Product";
              const image = getProductImage(item);

              return (
                <div className="cart-item" key={pId}>
                  <div className="cart-image-container">
                    <img
                      src={image}
                      alt={title}
                      className="cart-image"
                    />
                  </div>

                  <div className="cart-details">
                    <h4 className="cart-details-title">{title}</h4>
                    <p className="cart-details-price">
                      ${Number(item.price || 0).toFixed(2)} each
                    </p>

                    <div className="cart-controls">
                      <button
                        className="qty-btn"
                        onClick={() => updateQuantity && updateQuantity(pId, -1)}
                        aria-label="Decrease quantity"
                      >
                        -
                      </button>
                      <span className="qty-display">{item.quantity}</span>
                      <button
                        className="qty-btn"
                        onClick={() => updateQuantity && updateQuantity(pId, 1)}
                        aria-label="Increase quantity"
                      >
                        +
                      </button>

                      {removeFromCart && (
                        <button
                          className="remove-btn"
                          onClick={() => removeFromCart(pId)}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="cart-subtotal">
                    ${(Number(item.price || 0) * item.quantity).toFixed(2)}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="cart-summary-card">
            <h3 className="summary-heading">Order Summary</h3>

            <div className="summary-row">
              <span>Total Items</span>
              <span>{totalItems}</span>
            </div>

            <div className="summary-row">
              <span>Shipping</span>
              <span>Free</span>
            </div>

            <div className="summary-total">
              <span>Estimated Total</span>
              <span>${totalPrice.toFixed(2)}</span>
            </div>

            <button
              className="checkout-btn"
              onClick={handleCheckout}
              disabled={placing}
            >
              {placing ? "Placing Order..." : "Proceed to Checkout"}
            </button>

            {clearCart && (
              <button className="clear-cart-btn" onClick={clearCart}>
                Clear Cart
              </button>
            )}

            <div style={{ marginTop: "16px", paddingTop: "14px", borderTop: "1px dashed #e3dccb", textAlign: "center" }}>
              <span style={{ fontSize: "13px", color: "#54665c" }}>Have reserved products? </span>
              <Link to="/reservations" style={{ fontSize: "13px", fontWeight: "600", color: "#1b3b2b" }}>
                My Reservations &rarr;
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Cart;
