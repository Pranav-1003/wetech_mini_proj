import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  getItemId,
  getProductImage,
  getAuthHeaders,
  API_ORDERS_URL,
  API_BUDGET_URL,
  API_BUDGET_ALTERNATIVES_URL,
  API_CART_URL,
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

  // Order & Checkout States
  const [orderStatus, setOrderStatus] = useState(null); // { type: "success"|"error", message }
  const [placing, setPlacing] = useState(false);

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

  // Interactive Replacement Customization Modal State
  const [replacementModal, setReplacementModal] = useState({
    isOpen: false,
    originalProduct: null,
    suggestedProduct: null,
    removeProductIds: [],
    addProduct: null,
    saving: false,
  });

  const totalItems = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
  const frontendTotal = cart.reduce(
    (sum, item) => sum + Number(item.price || item.productPrice || 0) * (item.quantity || 1),
    0
  );

  const handleCheckout = async () => {
    if (cart.length === 0) return;

    setPlacing(true);
    setOrderStatus(null);

    const items = cart.map((item) => ({
      productId: getItemId(item),
      quantity: item.quantity || 1,
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

      setOrderStatus({ type: "success", message: data.message || "Order placed successfully! Product quantities updated." });
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

  // 4. Replacement Modal Handlers
  const openReplacementModal = (originalProduct, suggestion) => {
    const origId = getItemId(originalProduct);
    const sugId = getItemId(suggestion);
    const maxStock = Number(suggestion.availableStock !== undefined ? suggestion.availableStock : 99);
    const initialQty = Math.min(Number(originalProduct.quantity || 1), maxStock > 0 ? maxStock : 1) || 1;

    setReplacementModal({
      isOpen: true,
      originalProduct,
      suggestedProduct: suggestion,
      removeProductIds: [origId], // By default, select the original product to be removed
      addProduct: {
        productId: sugId,
        name: suggestion.name || suggestion.productName || "Product",
        price: Number(suggestion.price || suggestion.productPrice || 0),
        image: suggestion.image,
        category: suggestion.category,
        quantity: initialQty,
        checked: true, // By default, select to add
        maxStock,
        savings: Number(suggestion.savings || 0),
      },
      saving: false,
    });
  };

  const closeReplacementModal = () => {
    setReplacementModal((prev) => ({
      ...prev,
      isOpen: false,
      saving: false,
    }));
  };

  const toggleItemRemoval = (productId) => {
    setReplacementModal((prev) => {
      const exists = prev.removeProductIds.includes(productId);
      return {
        ...prev,
        removeProductIds: exists
          ? prev.removeProductIds.filter((id) => id !== productId)
          : [...prev.removeProductIds, productId],
      };
    });
  };

  const toggleAddProduct = () => {
    setReplacementModal((prev) => ({
      ...prev,
      addProduct: {
        ...prev.addProduct,
        checked: !prev.addProduct.checked,
      },
    }));
  };

  const changeAddQuantity = (delta) => {
    setReplacementModal((prev) => {
      if (!prev.addProduct) return prev;
      const current = prev.addProduct.quantity;
      const max = prev.addProduct.maxStock || 99;
      const next = Math.max(1, Math.min(max, current + delta));
      return {
        ...prev,
        addProduct: {
          ...prev.addProduct,
          quantity: next,
        },
      };
    });
  };

  const handleSaveReplacement = async () => {
    if (!replacementModal.isOpen) return;

    const { removeProductIds, addProduct } = replacementModal;

    // Validation: make sure at least one action is selected
    if (removeProductIds.length === 0 && (!addProduct || !addProduct.checked)) {
      alert("No changes selected. Please select at least one product to remove or add, or click Cancel.");
      return;
    }

    setReplacementModal((prev) => ({ ...prev, saving: true }));

    // 1. Construct the new cart based on user selections
    let updatedCart = cart.filter((item) => !removeProductIds.includes(getItemId(item)));

    // 2. If addProduct is checked, add it to updatedCart
    if (addProduct && addProduct.checked && addProduct.quantity > 0) {
      const existingIdx = updatedCart.findIndex(
        (item) => String(getItemId(item)) === String(addProduct.productId)
      );

      if (existingIdx !== -1) {
        updatedCart = updatedCart.map((item, idx) =>
          idx === existingIdx
            ? { ...item, quantity: (item.quantity || 1) + addProduct.quantity }
            : item
        );
      } else {
        updatedCart.push({
          productId: addProduct.productId,
          name: addProduct.name,
          productName: addProduct.name,
          price: addProduct.price,
          productPrice: addProduct.price,
          quantity: addProduct.quantity,
          category: addProduct.category,
          image: addProduct.image,
        });
      }
    }

    // 3. Update React state and localStorage immediately
    if (setCart) {
      setCart(updatedCart);
    }
    localStorage.setItem("lab8_cart", JSON.stringify(updatedCart));

    // 4. Synchronize with backend API (/api/cart)
    try {
      const token = localStorage.getItem("lab8_token");
      if (token) {
        const payloadCart = updatedCart.map((item) => ({
          productId: getItemId(item),
          quantity: Number(item.quantity || 1),
        }));

        const res = await fetch(API_CART_URL, {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({ cart: payloadCart }),
        });

        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          if (data && Array.isArray(data.cart) && setCart) {
            setCart(data.cart);
            localStorage.setItem("lab8_cart", JSON.stringify(data.cart));
          }
          if (data && data.cartTotal !== undefined) {
            setEvaluation((prev) => ({
              ...prev,
              cartTotal: data.cartTotal,
              remainingBudget: data.remainingBudget,
              exceededAmount: data.exceededAmount,
              isExceeded: data.isExceeded,
            }));
          }
        }
      }
    } catch (err) {
      console.error("Cart sync error:", err);
    }

    // 5. Provide feedback to the user
    const removedCount = removeProductIds.length;
    const addedName = addProduct && addProduct.checked ? addProduct.name : null;
    let msg = "Cart updated successfully!";
    if (removedCount > 0 && addedName) {
      msg = `Cart updated! Removed ${removedCount} product(s) and added ${addProduct.quantity}x '${addedName}'.`;
    } else if (removedCount > 0) {
      msg = `Cart updated! Removed ${removedCount} product(s).`;
    } else if (addedName) {
      msg = `Cart updated! Added ${addProduct.quantity}x '${addedName}'.`;
    }

    setActionNotice({ type: "success", message: msg });
    setTimeout(() => setActionNotice(null), 5000);

    // 6. Close the modal
    closeReplacementModal();

    // 7. Re-evaluate alternatives with new cart
    evaluateBudgetAndAlternatives(updatedCart);
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

        {/* Order Status Feedback */}
        {orderStatus && (
          <div
            className={`alert ${
              orderStatus.type === "success" ? "alert-success" : "alert-error"
            }`}
            style={{ marginBottom: "20px" }}
          >
            <span>{orderStatus.message}</span>
          </div>
        )}

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
                                      onClick={() => openReplacementModal(orig, sug)}
                                    >
                                      Replace Product
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

      {/* Interactive Replacement Customization Modal */}
      {replacementModal.isOpen && (
        <div className="modal-backdrop" onClick={closeReplacementModal}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="modal-header">
              <div>
                <h3 className="modal-title">Customize Product Replacement</h3>
                <p className="modal-subtitle">
                  Select which product(s) to remove and which to add. Your cart will only be updated when you click <strong>Save Changes</strong>.
                </p>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={closeReplacementModal}
                aria-label="Close"
              >
                &times;
              </button>
            </div>

            {/* Body */}
            <div className="modal-body">
              {/* Section 1: Products to remove */}
              <div className="modal-section">
                <div className="modal-section-title">
                  <span>1. Products to Remove from Cart</span>
                </div>
                <p className="modal-section-hint">
                  Select the item(s) you wish to remove. Unchecked items will remain safely in your cart.
                </p>

                {cart.map((item) => {
                  const pId = getItemId(item);
                  const isChecked = replacementModal.removeProductIds.includes(pId);
                  const isOriginal =
                    replacementModal.originalProduct &&
                    getItemId(replacementModal.originalProduct) === pId;
                  const itemTitle = item.name || item.productName || "Product";
                  const itemPrice = Number(item.price || item.productPrice || 0);
                  const itemQty = Number(item.quantity || 1);
                  const subtotal = itemPrice * itemQty;

                  return (
                    <div
                      key={pId}
                      className={`modal-item-card ${isChecked ? "selected-remove" : ""}`}
                      onClick={() => toggleItemRemoval(pId)}
                    >
                      <input
                        type="checkbox"
                        className="modal-checkbox danger-check"
                        checked={isChecked}
                        onChange={() => {}}
                        aria-label={`Remove ${itemTitle}`}
                      />
                      <img
                        src={getProductImage(item)}
                        alt={itemTitle}
                        className="modal-thumb"
                      />
                      <div className="modal-item-info">
                        <p className="modal-item-name">{itemTitle}</p>
                        <div className="modal-item-meta">
                          <span>${itemPrice.toFixed(2)} each</span>
                          <span>&bull;</span>
                          <span>In Cart: {itemQty}</span>
                          {isOriginal && (
                            <span className="badge-tag-remove">Target of Suggestion</span>
                          )}
                          {!isChecked && (
                            <span className="badge-tag-keep">Will Keep</span>
                          )}
                        </div>
                      </div>
                      <div className="modal-item-price-col">
                        <span className="modal-item-price">${subtotal.toFixed(2)}</span>
                        <div className="modal-item-subtotal">
                          {isChecked ? (
                            <span style={{ color: "#dc2626", fontWeight: "600" }}>Will Remove</span>
                          ) : (
                            <span>Keep in Cart</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Section 2: Products to add */}
              <div className="modal-section">
                <div className="modal-section-title">
                  <span>2. Product to Add to Cart</span>
                </div>
                <p className="modal-section-hint">
                  Confirm the replacement product and quantity to add to your cart.
                </p>

                {replacementModal.addProduct && (
                  <div
                    className={`modal-item-card ${
                      replacementModal.addProduct.checked ? "selected-add" : ""
                    }`}
                    onClick={toggleAddProduct}
                  >
                    <input
                      type="checkbox"
                      className="modal-checkbox"
                      checked={replacementModal.addProduct.checked}
                      onChange={() => {}}
                      aria-label={`Add ${replacementModal.addProduct.name}`}
                    />
                    <img
                      src={getProductImage(replacementModal.addProduct)}
                      alt={replacementModal.addProduct.name}
                      className="modal-thumb"
                    />
                    <div className="modal-item-info">
                      <p className="modal-item-name">{replacementModal.addProduct.name}</p>
                      <div className="modal-item-meta">
                        <span>${replacementModal.addProduct.price.toFixed(2)} each</span>
                        {replacementModal.addProduct.savings > 0 && (
                          <span className="badge-tag-add">
                            Save ${replacementModal.addProduct.savings.toFixed(2)} each
                          </span>
                        )}
                        <span>&bull;</span>
                        <span style={{ color: "#15803d" }}>In Stock</span>
                      </div>
                    </div>
                    <div className="modal-item-price-col" onClick={(e) => e.stopPropagation()}>
                      <div className="modal-qty-controls">
                        <button
                          type="button"
                          className="modal-qty-btn"
                          onClick={() => changeAddQuantity(-1)}
                          disabled={replacementModal.addProduct.quantity <= 1}
                          aria-label="Decrease quantity"
                        >
                          -
                        </button>
                        <span className="modal-qty-value">
                          {replacementModal.addProduct.quantity}
                        </span>
                        <button
                          type="button"
                          className="modal-qty-btn"
                          onClick={() => changeAddQuantity(1)}
                          disabled={
                            replacementModal.addProduct.quantity >=
                            (replacementModal.addProduct.maxStock || 99)
                          }
                          aria-label="Increase quantity"
                        >
                          +
                        </button>
                      </div>
                      <div className="modal-item-subtotal">
                        <strong>
                          $
                          {(
                            replacementModal.addProduct.price *
                            replacementModal.addProduct.quantity
                          ).toFixed(2)}
                        </strong>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Section 3: Summary / Preview */}
              {(() => {
                const removedValue = cart
                  .filter((item) => replacementModal.removeProductIds.includes(getItemId(item)))
                  .reduce(
                    (sum, item) =>
                      sum + Number(item.price || item.productPrice || 0) * (item.quantity || 1),
                    0
                  );
                const addedValue =
                  replacementModal.addProduct && replacementModal.addProduct.checked
                    ? replacementModal.addProduct.price * replacementModal.addProduct.quantity
                    : 0;
                const projectedTotal = Math.max(0, frontendTotal - removedValue + addedValue);
                const netSavings = frontendTotal - projectedTotal;

                return (
                  <div className="modal-summary-box">
                    <div className="modal-summary-row">
                      <span>Current Cart Total:</span>
                      <span>${frontendTotal.toFixed(2)}</span>
                    </div>
                    <div className="modal-summary-row" style={{ color: "#dc2626" }}>
                      <span>- Items Removed ({replacementModal.removeProductIds.length}):</span>
                      <span>-${removedValue.toFixed(2)}</span>
                    </div>
                    <div className="modal-summary-row" style={{ color: "#15803d" }}>
                      <span>+ Items Added ({replacementModal.addProduct?.checked ? 1 : 0}):</span>
                      <span>+${addedValue.toFixed(2)}</span>
                    </div>
                    <div className="modal-summary-total">
                      <span>Projected New Cart Total:</span>
                      <span>${projectedTotal.toFixed(2)}</span>
                    </div>
                    {netSavings !== 0 && (
                      <div
                        style={{
                          marginTop: "8px",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          fontSize: "13px",
                        }}
                      >
                        <span style={{ fontWeight: "600" }}>Estimated Difference:</span>
                        <span className="modal-savings-pill">
                          {netSavings > 0
                            ? `You Save $${netSavings.toFixed(2)}`
                            : `+$${Math.abs(netSavings).toFixed(2)}`}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Footer */}
            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={closeReplacementModal}
                disabled={replacementModal.saving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleSaveReplacement}
                disabled={replacementModal.saving}
              >
                {replacementModal.saving ? "Saving Changes..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Cart;
