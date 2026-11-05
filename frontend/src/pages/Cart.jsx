import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  getItemId,
  getProductImage,
  getAuthHeaders,
  API_BUDGET_URL,
  API_BUDGET_ALTERNATIVES_URL,
  API_CART_REPLACE_URL,
} from "../api";
import Navbar from "../components/Navbar";
import "../App.css";

function Cart({
  currentUser,
  onLogout,
  cart = [],
  setCart,
  updateQuantity,
  removeFromCart,
  clearCart,
}) {
  const navigate = useNavigate();

  // Budget States
  const [budget, setBudget] = useState(0);
  const [budgetInput, setBudgetInput] = useState("");
  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [savingBudget, setSavingBudget] = useState(false);
  const [budgetFeedback, setBudgetFeedback] = useState(null);

  // Alternatives and Evaluation States
  const [evaluation, setEvaluation] = useState({
    budget: 0,
    cartTotal: 0,
    remainingBudget: 0,
    exceededAmount: 0,
    isExceeded: false,
    alternatives: [],
  });
  const [loadingAlternatives, setLoadingAlternatives] = useState(false);
  const [replacingId, setReplacingId] = useState(null);
  const [actionNotice, setActionNotice] = useState(null);

  const totalItems = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
  const frontendTotal = cart.reduce(
    (sum, item) => sum + Number(item.price || item.productPrice || 0) * (item.quantity || 1),
    0
  );

  // 1. Fetch User's Persisted Budget from MongoDB on Mount
  const fetchBudget = useCallback(async () => {
    const token = localStorage.getItem("lab8_token");
    if (!token) return;

    try {
      const res = await fetch(API_BUDGET_URL, {
        method: "GET",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        const userBudget = Number(data.budget || 0);
        setBudget(userBudget);
        setBudgetInput(userBudget > 0 ? String(userBudget) : "");
      }
    } catch (err) {
      console.error("Failed to load budget:", err);
    }
  }, []);

  // 2. Evaluate Cart Total & Alternatives against Backend (Actual MongoDB Prices)
  const evaluateBudgetAndAlternatives = useCallback(
    async (currentCart = cart) => {
      const token = localStorage.getItem("lab8_token");
      if (!token || currentCart.length === 0) {
        setEvaluation({
          budget,
          cartTotal: frontendTotal,
          remainingBudget: Math.max(0, budget - frontendTotal),
          exceededAmount: budget > 0 && frontendTotal > budget ? frontendTotal - budget : 0,
          isExceeded: budget > 0 && frontendTotal > budget,
          alternatives: [],
        });
        return;
      }

      setLoadingAlternatives(true);
      try {
        const payloadCart = currentCart.map((item) => ({
          productId: getItemId(item),
          quantity: Number(item.quantity || 1),
        }));

        const res = await fetch(API_BUDGET_ALTERNATIVES_URL, {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({ cart: payloadCart }),
        });

        if (res.ok) {
          const data = await res.json();
          setEvaluation(data);
          if (data.budget !== undefined && data.budget !== budget) {
            setBudget(data.budget);
            if (!isEditingBudget) {
              setBudgetInput(data.budget > 0 ? String(data.budget) : "");
            }
          }
        }
      } catch (err) {
        console.error("Evaluation error:", err);
      } finally {
        setLoadingAlternatives(false);
      }
    },
    [cart, budget, frontendTotal, isEditingBudget]
  );

  useEffect(() => {
    fetchBudget();
  }, [fetchBudget]);

  useEffect(() => {
    evaluateBudgetAndAlternatives(cart);
  }, [cart, budget, evaluateBudgetAndAlternatives]);

  // 3. Save / Update Budget Handler
  const handleSaveBudget = async (e) => {
    e.preventDefault();
    setBudgetFeedback(null);

    const val = Number(budgetInput);
    if (isNaN(val) || val < 0) {
      setBudgetFeedback({ type: "error", message: "Please enter a valid non-negative budget." });
      return;
    }

    setSavingBudget(true);
    try {
      const res = await fetch(API_BUDGET_URL, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ budget: val }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setBudget(Number(data.budget));
        setIsEditingBudget(false);
        setBudgetFeedback({
          type: "success",
          message: val > 0 ? `Budget updated to $${val.toFixed(2)}.` : "Budget reset to $0.00.",
        });
        setTimeout(() => setBudgetFeedback(null), 3000);
      } else {
        setBudgetFeedback({ type: "error", message: data.message || "Failed to save budget." });
      }
    } catch {
      setBudgetFeedback({ type: "error", message: "Unable to connect to backend server." });
    } finally {
      setSavingBudget(false);
    }
  };

  // 4. Replace Product Handler
  const handleReplaceProduct = async (originalProduct, suggestion) => {
    const origId = getItemId(originalProduct);
    const repId = suggestion.productId;

    setReplacingId(repId);
    setActionNotice(null);

    try {
      const res = await fetch(API_CART_REPLACE_URL, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          originalProductId: origId,
          replacementProductId: repId,
          cart: cart.map((i) => ({ productId: getItemId(i), quantity: i.quantity || 1 })),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setActionNotice({ type: "error", message: data.message || "Failed to replace product." });
        setReplacingId(null);
        return;
      }

      // Update cart state in React & LocalStorage
      if (setCart && Array.isArray(data.cart)) {
        setCart(data.cart);
        localStorage.setItem("lab8_cart", JSON.stringify(data.cart));
      }

      setActionNotice({
        type: "success",
        message: `Successfully replaced '${originalProduct.name || originalProduct.productName}' with '${suggestion.name || suggestion.productName}'. You saved $${(suggestion.totalSavings || suggestion.savings).toFixed(2)}!`,
      });

      // Update evaluation state immediately from authoritative backend response
      setEvaluation((prev) => ({
        ...prev,
        cartTotal: data.cartTotal,
        remainingBudget: data.remainingBudget,
        exceededAmount: data.exceededAmount,
        isExceeded: data.isExceeded,
      }));

      setTimeout(() => setActionNotice(null), 4000);
    } catch (err) {
      console.error("Replacement error:", err);
      setActionNotice({ type: "error", message: "Network error while replacing product." });
    } finally {
      setReplacingId(null);
    }
  };

  // Calculations for display
  const activeCartTotal = evaluation.cartTotal > 0 ? evaluation.cartTotal : frontendTotal;
  const isExceeded = budget > 0 && activeCartTotal > budget;
  const remainingBudget = Math.max(0, Number((budget - activeCartTotal).toFixed(2)));
  const exceededAmount = isExceeded ? Number((activeCartTotal - budget).toFixed(2)) : 0;

  // Progress Bar Percentage
  const progressPercent = budget > 0 ? Math.min(100, (activeCartTotal / budget) * 100) : 0;
  const progressColor =
    progressPercent > 100 || isExceeded ? "#dc2626" : progressPercent >= 80 ? "#d97706" : "#16a34a";

  return (
    <div className="page-wrapper">
      <Navbar currentUser={currentUser} onLogout={onLogout} cartCount={totalItems} />

      <main className="content-container">
        {/* Cart Page Header */}
        <div className="cart-header">
          <Link to="/products" className="back-btn">
            &larr; Continue Shopping
          </Link>
          <h2 className="cart-title">Shopping Cart ({totalItems} items)</h2>
        </div>

        {/* Global Action / Feedback Toast */}
        {actionNotice && (
          <div
            className={`alert ${actionNotice.type === "success" ? "alert-success" : "alert-error"}`}
            style={{ marginBottom: "20px" }}
          >
            {actionNotice.message}
          </div>
        )}

        {cart.length === 0 ? (
          <div className="status-container">
            <p className="status-title">Your Cart is Empty</p>
            <p className="status-text">
              Looks like you haven't added any products to your cart yet.
            </p>
            <Link to="/products" className="btn-primary" style={{ marginTop: "16px" }}>
              Explore Products
            </Link>
          </div>
        ) : (
          <>
            {/* FEATURE 1: SHOPPING BUDGET LIMIT PANEL */}
            <section className="budget-panel">
              <div className="budget-panel-header">
                <div>
                  <h3 className="budget-panel-title">Shopping Budget Limit</h3>
                  <p className="budget-panel-subtitle">
                    Establish a maximum spend limit. We'll automatically identify if your cart exceeds
                    it and find cheaper alternatives.
                  </p>
                </div>
                {!isEditingBudget && budget > 0 && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setIsEditingBudget(true)}
                    style={{ padding: "6px 14px", fontSize: "13px" }}
                  >
                    Edit Budget
                  </button>
                )}
              </div>

              {/* Budget Setting Form */}
              {(isEditingBudget || budget === 0) && (
                <form onSubmit={handleSaveBudget} className="budget-form">
                  <div className="budget-input-wrapper">
                    <span className="budget-currency-symbol">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="budget-input"
                      placeholder="e.g. 100.00"
                      value={budgetInput}
                      onChange={(e) => setBudgetInput(e.target.value)}
                      required
                    />
                  </div>
                  <button type="submit" className="btn-primary" disabled={savingBudget}>
                    {savingBudget ? "Saving..." : "Save Budget"}
                  </button>
                  {budget > 0 && (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => {
                        setBudgetInput(String(budget));
                        setIsEditingBudget(false);
                      }}
                    >
                      Cancel
                    </button>
                  )}
                </form>
              )}

              {budgetFeedback && (
                <div
                  className={`alert ${budgetFeedback.type === "success" ? "alert-success" : "alert-error"}`}
                  style={{ marginTop: "12px", padding: "8px 14px", fontSize: "13px" }}
                >
                  {budgetFeedback.message}
                </div>
              )}

              {/* Budget Metric Indicators */}
              <div className="budget-metrics-grid">
                <div className="budget-metric-card">
                  <span className="metric-label">Budget Limit</span>
                  <span className="metric-value font-mono">
                    {budget > 0 ? `$${budget.toFixed(2)}` : "Not Set"}
                  </span>
                </div>

                <div className="budget-metric-card">
                  <span className="metric-label">Cart Total</span>
                  <span className="metric-value font-mono">${activeCartTotal.toFixed(2)}</span>
                </div>

                {budget > 0 && (
                  <div className={`budget-metric-card ${isExceeded ? "metric-card-exceeded" : "metric-card-within"}`}>
                    <span className="metric-label">
                      {isExceeded ? "Exceeded Amount" : "Remaining Budget"}
                    </span>
                    <span className="metric-value font-mono">
                      {isExceeded ? `+$${exceededAmount.toFixed(2)}` : `$${remainingBudget.toFixed(2)}`}
                    </span>
                  </div>
                )}

                <div className="budget-metric-card">
                  <span className="metric-label">Status</span>
                  <div style={{ marginTop: "4px" }}>
                    {budget === 0 ? (
                      <span className="budget-status-pill pill-neutral">No Limit</span>
                    ) : isExceeded ? (
                      <span className="budget-status-pill pill-exceeded">Budget Exceeded</span>
                    ) : (
                      <span className="budget-status-pill pill-within">Within Budget</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              {budget > 0 && (
                <div className="budget-progress-container">
                  <div className="budget-progress-labels">
                    <span>Spend: ${(activeCartTotal).toFixed(2)}</span>
                    <span>
                      {((activeCartTotal / budget) * 100).toFixed(0)}% of ${budget.toFixed(2)}
                    </span>
                  </div>
                  <div className="budget-progress-track">
                    <div
                      className="budget-progress-bar"
                      style={{
                        width: `${Math.min(100, progressPercent)}%`,
                        backgroundColor: progressColor,
                      }}
                    />
                  </div>
                  {isExceeded && (
                    <p className="budget-exceeded-notice">
                      ⚠️ Cart exceeds budget by <strong>${exceededAmount.toFixed(2)}</strong>.
                      Review the recommended alternatives below to reduce costs!
                    </p>
                  )}
                </div>
              )}
            </section>

            {/* FEATURE 2: CHEAPER WORTHY ALTERNATIVES SECTION (Only displayed when cart exceeds budget) */}
            {isExceeded && (
              <section className="alternatives-section">
                <div className="alternatives-header">
                  <div>
                    <h3 className="alternatives-title">Cheaper Worthy Alternatives</h3>
                    <p className="alternatives-subtitle">
                      Your cart exceeds your ${budget.toFixed(2)} budget by{" "}
                      <span className="text-danger font-bold">${exceededAmount.toFixed(2)}</span>.
                      Swap with these verified in-stock alternatives to bring your total down:
                    </p>
                  </div>
                  {loadingAlternatives && (
                    <span className="alternatives-loading-badge">Evaluating catalog...</span>
                  )}
                </div>

                {evaluation.alternatives && evaluation.alternatives.length > 0 ? (
                  <div className="alternatives-list">
                    {evaluation.alternatives.map((item) => {
                      const orig = item.originalProduct;
                      const origId = getItemId(orig);

                      return (
                        <div key={origId} className="alternative-group-card">
                          {/* Original Product Banner */}
                          <div className="original-item-banner">
                            <span className="orig-badge">In Your Cart</span>
                            <span className="orig-name">{orig.name || orig.productName}</span>
                            <span className="orig-cat">Category: {orig.category}</span>
                            <span className="orig-qty">Qty: {orig.quantity}</span>
                            <span className="orig-price">
                              ${Number(orig.price || orig.productPrice).toFixed(2)} each
                            </span>
                          </div>

                          {/* Suggested Alternatives Grid */}
                          <div className="suggestions-grid">
                            {item.suggestions.map((sug) => {
                              const isReplacing = replacingId === sug.productId;

                              return (
                                <div key={sug.productId} className="suggestion-card">
                                  <div className="suggestion-img-box">
                                    <img
                                      src={getProductImage(sug)}
                                      alt={sug.name || sug.productName}
                                      className="suggestion-img"
                                    />
                                  </div>

                                  <div className="suggestion-body">
                                    <h4 className="suggestion-name">{sug.name || sug.productName}</h4>
                                    <div className="suggestion-price-row">
                                      <span className="sug-price">
                                        ${Number(sug.price || sug.productPrice).toFixed(2)}
                                      </span>
                                      <span className="sug-savings">
                                        Save ${Number(sug.savings).toFixed(2)} each
                                      </span>
                                    </div>

                                    {orig.quantity > 1 && (
                                      <div className="sug-total-savings">
                                        Total Savings:{" "}
                                        <strong>
                                          ${Number(sug.totalSavings || sug.savings * orig.quantity).toFixed(2)}
                                        </strong>
                                      </div>
                                    )}

                                    <div className="sug-stock-info">
                                      <span className="stock-dot in-stock"></span>
                                      <span>In Stock ({sug.availableStock} available)</span>
                                    </div>

                                    <button
                                      type="button"
                                      className="btn-replace-product"
                                      onClick={() => handleReplaceProduct(orig, sug)}
                                      disabled={isReplacing}
                                    >
                                      {isReplacing ? "Replacing..." : "Replace Product"}
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="status-container" style={{ padding: "20px" }}>
                    <p className="status-text">
                      No cheaper alternatives found in the current catalog for your cart items.
                    </p>
                  </div>
                )}
              </section>
            )}

            {/* Standard Cart Items List & Order Summary */}
            <div className="cart-layout">
              <div className="cart-list">
                {cart.map((item) => {
                  const pId = getItemId(item);
                  const title = item.name || item.productName || item.title || "Product";
                  const image = getProductImage(item);
                  const price = Number(item.price !== undefined ? item.price : item.productPrice || 0);

                  return (
                    <div className="cart-item" key={pId}>
                      <div className="cart-image-container">
                        <img src={image} alt={title} className="cart-image" />
                      </div>

                      <div className="cart-details">
                        <h4 className="cart-details-title">{title}</h4>
                        <p className="cart-details-price">${price.toFixed(2)} each</p>

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
                            <button className="remove-btn" onClick={() => removeFromCart(pId)}>
                              Remove
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="cart-subtotal">
                        ${(price * (item.quantity || 1)).toFixed(2)}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Order Summary Card */}
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

                {budget > 0 && (
                  <div className="summary-row" style={{ paddingTop: "8px", borderTop: "1px dashed #e3dccb" }}>
                    <span>Budget Limit</span>
                    <span className="font-mono">${budget.toFixed(2)}</span>
                  </div>
                )}

                <div className="summary-total">
                  <span>Estimated Total</span>
                  <span className="font-mono">${activeCartTotal.toFixed(2)}</span>
                </div>

                {budget > 0 && (
                  <div
                    style={{
                      padding: "8px 12px",
                      borderRadius: "6px",
                      marginBottom: "16px",
                      fontSize: "13px",
                      backgroundColor: isExceeded ? "#fee2e2" : "#dcfce7",
                      color: isExceeded ? "#b91c1c" : "#15803d",
                      fontWeight: "600",
                      textAlign: "center",
                    }}
                  >
                    {isExceeded
                      ? `Exceeds budget by $${exceededAmount.toFixed(2)}`
                      : `Within budget ($${remainingBudget.toFixed(2)} left)`}
                  </div>
                )}

                <button
                  className="checkout-btn"
                  onClick={() => alert("Thank you for your order! Checkout simulation complete.")}
                >
                  Proceed to Checkout
                </button>

                {clearCart && (
                  <button className="clear-cart-btn" onClick={clearCart}>
                    Clear Cart
                  </button>
                )}

                <div
                  style={{
                    marginTop: "16px",
                    paddingTop: "14px",
                    borderTop: "1px dashed #e3dccb",
                    textAlign: "center",
                  }}
                >
                  <span style={{ fontSize: "13px", color: "#54665c" }}>Have reserved products? </span>
                  <Link
                    to="/reservations"
                    style={{ fontSize: "13px", fontWeight: "600", color: "#1b3b2b" }}
                  >
                    My Reservations &rarr;
                  </Link>
                </div>

                <div
                  style={{
                    marginTop: "10px",
                    paddingTop: "10px",
                    borderTop: "1px dashed #e3dccb",
                    textAlign: "center",
                  }}
                >
                  <span style={{ fontSize: "13px", color: "#54665c" }}>Shopping with friends? </span>
                  <Link
                    to="/shared-cart"
                    style={{ fontSize: "13px", fontWeight: "600", color: "#1b3b2b" }}
                  >
                    Try Shared Cart 👥 &rarr;
                  </Link>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default Cart;
