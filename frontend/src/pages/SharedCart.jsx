import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  API_SHARED_CARTS_URL,
  API_PRODUCTS_URL,
  getAuthHeaders,
  getProductImage,
  getItemId,
} from "../api";
import Navbar from "../components/Navbar";
import "../App.css";

function SharedCart({ currentUser, onLogout }) {
  const { roomCode: urlRoomCode } = useParams();
  const navigate = useNavigate();

  // Lobby States
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [myRooms, setMyRooms] = useState([]);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [joiningRoom, setJoiningRoom] = useState(false);

  // Active Room States
  const [roomData, setRoomData] = useState(null);
  const [loadingRoom, setLoadingRoom] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [actionFeedback, setActionFeedback] = useState(null);
  const [copiedCode, setCopiedCode] = useState(false);

  // Catalog Products for Quick-Adding to Shared Cart
  const [catalog, setCatalog] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [addQuantity, setAddQuantity] = useState(1);
  const [addingProduct, setAddingProduct] = useState(false);

  // Polling tracker ref to prevent overlapping requests
  const isFetchingRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // 1. Fetch catalog products for quick add
  useEffect(() => {
    fetch(API_PRODUCTS_URL, { headers: getAuthHeaders() })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (Array.isArray(data)) {
          setCatalog(data);
          if (data.length > 0) setSelectedProductId(getItemId(data[0]));
        }
      })
      .catch(() => { });
  }, []);

  // 2. Fetch My Active Rooms (Lobby View)
  const fetchMyRooms = useCallback(async () => {
    const token = localStorage.getItem("lab8_token");
    if (!token) return;

    try {
      const res = await fetch(`${API_SHARED_CARTS_URL}/my/rooms`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setMyRooms(data);
      }
    } catch { }
  }, []);

  useEffect(() => {
    if (!urlRoomCode) {
      fetchMyRooms();
    }
  }, [urlRoomCode, fetchMyRooms]);

  // 3. Fetch Single Room Data (Active Room View)
  const fetchRoomData = useCallback(
    async (isInitial = false) => {
      if (!urlRoomCode) return;
      if (isFetchingRef.current) return; // Prevent overlapping requests

      isFetchingRef.current = true;
      if (isInitial) setLoadingRoom(true);

      try {
        const res = await fetch(`${API_SHARED_CARTS_URL}/${urlRoomCode.toUpperCase()}`, {
          headers: getAuthHeaders(),
        });

        if (!isMountedRef.current) return;

        if (res.status === 403) {
          setErrorMsg("Access denied. You are not an authorized member of this shared room.");
          setRoomData(null);
        } else if (res.status === 404) {
          setErrorMsg(`Room '${urlRoomCode}' not found.`);
          setRoomData(null);
        } else if (res.ok) {
          const data = await res.json();
          setRoomData(data);
          setErrorMsg("");
        } else {
          const data = await res.json().catch(() => ({}));
          setErrorMsg(data.message || `Failed to fetch shared cart (HTTP ${res.status})`);
        }
      } catch (err) {
        if (isMountedRef.current && isInitial) {
          setErrorMsg("Network error connecting to backend server.");
        }
      } finally {
        isFetchingRef.current = false;
        if (isMountedRef.current && isInitial) setLoadingRoom(false);
      }
    },
    [urlRoomCode]
  );

  // 4. Polling Synchronization (Every 2 Seconds)
  useEffect(() => {
    if (!urlRoomCode) {
      setRoomData(null);
      return;
    }

    // Initial fetch
    fetchRoomData(true);

    // Setup periodic polling interval (every 2000ms = 2s)
    const interval = setInterval(() => {
      if (roomData && roomData.status === "closed") {
        clearInterval(interval);
        return;
      }
      fetchRoomData(false);
    }, 2000);

    return () => {
      clearInterval(interval);
    };
  }, [urlRoomCode, fetchRoomData, roomData?.status]);

  // 5. Create Room Handler
  const handleCreateRoom = async () => {
    setCreatingRoom(true);
    setActionFeedback(null);
    try {
      const res = await fetch(`${API_SHARED_CARTS_URL}/create`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.sharedCart) {
        navigate(`/shared-cart/${data.sharedCart.roomCode}`);
      } else {
        setActionFeedback({ type: "error", message: data.message || "Failed to create shared room." });
      }
    } catch {
      setActionFeedback({ type: "error", message: "Network error while creating room." });
    } finally {
      setCreatingRoom(false);
    }
  };

  // 6. Join Room Handler
  const handleJoinRoom = async (e) => {
    e.preventDefault();
    if (!joinCodeInput.trim()) return;

    setJoiningRoom(true);
    setActionFeedback(null);
    try {
      const res = await fetch(`${API_SHARED_CARTS_URL}/join`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ roomCode: joinCodeInput.trim() }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.sharedCart) {
        navigate(`/shared-cart/${data.sharedCart.roomCode}`);
      } else {
        setActionFeedback({ type: "error", message: data.message || "Failed to join room." });
      }
    } catch {
      setActionFeedback({ type: "error", message: "Network error while joining room." });
    } finally {
      setJoiningRoom(false);
    }
  };

  // 7. Add Product to Shared Cart
  const handleAddProduct = async (e) => {
    e.preventDefault();
    if (!selectedProductId || addQuantity < 1 || !roomData) return;

    setAddingProduct(true);
    setActionFeedback(null);

    try {
      const res = await fetch(`${API_SHARED_CARTS_URL}/${roomData.roomCode}/items`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          productId: selectedProductId,
          quantity: Number(addQuantity),
          version: roomData.version,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 409) {
        setActionFeedback({
          type: "warning",
          message: data.message || "Cart was updated by another member. Latest changes synchronized.",
        });
        if (data.sharedCart) setRoomData(data.sharedCart);
        else fetchRoomData();
      } else if (res.ok) {
        setRoomData(data.sharedCart);
        setActionFeedback({ type: "success", message: data.message || "Product added to shared cart!" });
        setAddQuantity(1);
        setTimeout(() => setActionFeedback(null), 3000);
      } else {
        setActionFeedback({ type: "error", message: data.message || "Failed to add product." });
      }
    } catch {
      setActionFeedback({ type: "error", message: "Network error adding product." });
    } finally {
      setAddingProduct(false);
    }
  };

  // 8. Update Product Quantity
  const handleUpdateQuantity = async (productId, newQty) => {
    if (!roomData) return;
    setActionFeedback(null);

    try {
      const res = await fetch(`${API_SHARED_CARTS_URL}/${roomData.roomCode}/items/${productId}`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          quantity: newQty,
          version: roomData.version,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 409) {
        setActionFeedback({
          type: "warning",
          message: data.message || "Cart updated by another user. Synced latest version.",
        });
        if (data.sharedCart) setRoomData(data.sharedCart);
        else fetchRoomData();
      } else if (res.ok) {
        setRoomData(data.sharedCart);
      } else {
        setActionFeedback({ type: "error", message: data.message || "Failed to update quantity." });
      }
    } catch {
      setActionFeedback({ type: "error", message: "Network error updating quantity." });
    }
  };

  // 9. Remove Product from Shared Cart
  const handleRemoveProduct = async (productId) => {
    if (!roomData) return;
    setActionFeedback(null);

    try {
      const res = await fetch(`${API_SHARED_CARTS_URL}/${roomData.roomCode}/items/${productId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
        body: JSON.stringify({ version: roomData.version }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 409) {
        setActionFeedback({
          type: "warning",
          message: data.message || "Cart modified by another user. Synced latest version.",
        });
        if (data.sharedCart) setRoomData(data.sharedCart);
        else fetchRoomData();
      } else if (res.ok) {
        setRoomData(data.sharedCart);
      } else {
        setActionFeedback({ type: "error", message: data.message || "Failed to remove product." });
      }
    } catch {
      setActionFeedback({ type: "error", message: "Network error removing product." });
    }
  };

  // 10. Leave Room Handler
  const handleLeaveRoom = async () => {
    if (!window.confirm("Are you sure you want to leave this shared shopping room?")) return;

    try {
      const res = await fetch(`${API_SHARED_CARTS_URL}/${roomData.roomCode}/leave`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        navigate("/shared-cart");
      }
    } catch {
      alert("Failed to leave room.");
    }
  };

  // 11. Close Room Handler (Creator only)
  const handleCloseRoom = async () => {
    if (!window.confirm("Are you sure you want to permanently close this shared shopping room?"))
      return;

    try {
      const res = await fetch(`${API_SHARED_CARTS_URL}/${roomData.roomCode}/close`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        fetchRoomData();
        setActionFeedback({ type: "warning", message: "Shared shopping room has been closed." });
      }
    } catch {
      alert("Failed to close room.");
    }
  };

  // 12. Checkout Handler (Creator only)
  const handleCheckout = async () => {
    if (!roomData || roomData.items.length === 0) return;
    if (!window.confirm(`Confirm order checkout for $${roomData.cartTotal.toFixed(2)}?`)) return;

    setActionFeedback(null);
    try {
      const res = await fetch(`${API_SHARED_CARTS_URL}/${roomData.roomCode}/checkout`, {
        method: "POST",
        headers: getAuthHeaders(),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setRoomData(data.sharedCart);
        setActionFeedback({
          type: "success",
          message: "🎉 Order placed successfully for your shared cart! The room is now closed.",
        });
      } else {
        setActionFeedback({ type: "error", message: data.message || "Checkout failed." });
      }
    } catch {
      setActionFeedback({ type: "error", message: "Network error during checkout." });
    }
  };

  // Copy Room Code to Clipboard
  const handleCopyCode = () => {
    if (!roomData) return;
    navigator.clipboard.writeText(roomData.roomCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const isCreator =
    currentUser &&
    roomData &&
    roomData.createdBy &&
    (roomData.createdBy._id === currentUser.id ||
      roomData.createdBy._id === currentUser._id ||
      roomData.createdBy.emailId === currentUser.emailId);

  const totalSharedItems = roomData?.items?.reduce((sum, i) => sum + (i.quantity || 1), 0) || 0;

  return (
    <div className="page-wrapper">
      <Navbar currentUser={currentUser} onLogout={onLogout} />

      <main className="content-container">
        {/* VIEW 1: LOBBY VIEW (When no room is selected) */}
        {!urlRoomCode ? (
          <div className="shared-cart-lobby">
            <div className="page-header-banner">
              <div>
                <h2>Collaborative Shopping Cart</h2>
                <p className="subtext">
                  Shop together in real-time with family, roommates, or friends. Everyone in the
                  room sees updates synchronized live!
                </p>
              </div>
            </div>

            {actionFeedback && (
              <div
                className={`alert ${actionFeedback.type === "error" ? "alert-error" : "alert-success"}`}
                style={{ marginBottom: "20px" }}
              >
                {actionFeedback.message}
              </div>
            )}

            <div className="lobby-cards-grid">
              {/* Card A: Create New Room */}
              <div className="lobby-card">
                <div className="lobby-icon">🛒</div>
                <h3>Start a New Shared Cart</h3>
                <p>
                  Create a collaborative room, generate a unique room code, and share it with friends
                  to start adding items together.
                </p>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleCreateRoom}
                  disabled={creatingRoom}
                >
                  {creatingRoom ? "Generating Room..." : "Create Shared Cart Room"}
                </button>
              </div>

              {/* Card B: Join Existing Room */}
              <div className="lobby-card">
                <div className="lobby-icon">🔑</div>
                <h3>Join with a Room Code</h3>
                <p>
                  Have a room code shared by a friend? Enter it below to immediately join and collaborate
                  on their cart.
                </p>
                <form onSubmit={handleJoinRoom} className="join-form">
                  <input
                    type="text"
                    className="join-input"
                    placeholder="e.g. SHOP-8K42"
                    value={joinCodeInput}
                    onChange={(e) => setJoinCodeInput(e.target.value)}
                    required
                  />
                  <button type="submit" className="btn-secondary" disabled={joiningRoom}>
                    {joiningRoom ? "Joining..." : "Join Room"}
                  </button>
                </form>
              </div>
            </div>

            {/* My Active Rooms List */}
            {myRooms.length > 0 && (
              <div className="my-rooms-section">
                <h3>Your Active Shared Rooms</h3>
                <div className="my-rooms-grid">
                  {myRooms.map((room) => (
                    <div key={room._id} className="room-card">
                      <div className="room-card-header">
                        <span className="room-code-badge">{room.roomCode}</span>
                        <span className="room-status-dot online">Active</span>
                      </div>
                      <p className="room-card-info">
                        <strong>Creator:</strong> {room.createdBy?.username || "Member"}
                      </p>
                      <p className="room-card-info">
                        <strong>Members:</strong> {room.members?.length || 1} participant(s)
                      </p>
                      <p className="room-card-info">
                        <strong>Items in Cart:</strong> {room.items?.length || 0}
                      </p>
                      <Link to={`/shared-cart/${room.roomCode}`} className="btn-primary mt-2">
                        Enter Room &rarr;
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* VIEW 2: ACTIVE SHARED CART ROOM */
          <div className="shared-cart-room">
            {/* Navigation back to Lobby */}
            <div style={{ marginBottom: "16px" }}>
              <Link to="/shared-cart" className="back-btn">
                &larr; Back to Shared Carts Lobby
              </Link>
            </div>

            {/* Loading / Error Displays */}
            {loadingRoom && (
              <div className="status-container">
                <div className="spinner"></div>
                <p className="status-title">Connecting to Shared Room...</p>
              </div>
            )}

            {errorMsg && (
              <div className="status-container error-state">
                <p className="status-title">Unable to Open Shared Room</p>
                <p className="status-text">{errorMsg}</p>
                <Link to="/shared-cart" className="btn-primary mt-2">
                  Return to Lobby
                </Link>
              </div>
            )}

            {roomData && !loadingRoom && (
              <>
                {/* Room Top Banner */}
                <div className="shared-room-banner">
                  <div className="room-banner-left">
                    <span className="room-status-badge">
                      {roomData.status === "active" ? "🟢 Live Active Room" : "🔴 Closed Room"}
                    </span>
                    <h2 className="shared-room-title">
                      Room Code: <span className="font-mono">{roomData.roomCode}</span>
                    </h2>
                    <p className="room-sync-indicator">
                      <span className="pulse-dot"></span>
                      Live Syncing via REST Polling (every 2s) &bull; Version #{roomData.version}
                    </p>
                  </div>

                  <div className="room-banner-right">
                    <button
                      type="button"
                      className="btn-secondary copy-code-btn"
                      onClick={handleCopyCode}
                      title="Share this code with friends so they can join"
                    >
                      {copiedCode ? "✓ Code Copied!" : "📋 Copy Room Code"}
                    </button>

                    <button
                      type="button"
                      className="btn-danger-outline"
                      onClick={handleLeaveRoom}
                    >
                      Leave Room
                    </button>

                    {isCreator && roomData.status === "active" && (
                      <button
                        type="button"
                        className="btn-danger-action"
                        onClick={handleCloseRoom}
                        title="Close room for all members"
                      >
                        Close Room
                      </button>
                    )}
                  </div>
                </div>

                {/* Participating Members Bar */}
                <div className="members-bar">
                  <span className="members-bar-label">👥 Room Members ({roomData.members?.length}):</span>
                  <div className="members-list">
                    {roomData.members?.map((member) => {
                      const isMemberCreator = member._id === roomData.createdBy?._id;
                      const isMe =
                        currentUser &&
                        (member._id === currentUser.id ||
                          member._id === currentUser._id ||
                          member.emailId === currentUser.emailId);

                      return (
                        <span key={member._id} className="member-chip">
                          {isMemberCreator && <span className="creator-crown" title="Room Creator">👑</span>}
                          <strong>{member.username}</strong>
                          {isMe && <span className="me-badge">(You)</span>}
                        </span>
                      );
                    })}
                  </div>
                </div>

                {/* Action Feedback Notifications */}
                {actionFeedback && (
                  <div
                    className={`alert ${actionFeedback.type === "success"
                        ? "alert-success"
                        : actionFeedback.type === "warning"
                          ? "alert-warning"
                          : "alert-error"
                      }`}
                    style={{ margin: "16px 0" }}
                  >
                    {actionFeedback.message}
                  </div>
                )}

                {/* Quick Add Product Bar (Only in active rooms) */}
                {roomData.status === "active" && catalog.length > 0 && (
                  <div className="quick-add-card">
                    <h4>Add Item to Shared Cart</h4>
                    <form onSubmit={handleAddProduct} className="quick-add-form">
                      <select
                        className="quick-add-select"
                        value={selectedProductId}
                        onChange={(e) => setSelectedProductId(e.target.value)}
                      >
                        {catalog.map((p) => (
                          <option key={getItemId(p)} value={getItemId(p)}>
                            {p.productName || p.name} (${Number(p.productPrice || p.price || 0).toFixed(2)}) &bull; Qty: {p.quantity}
                          </option>
                        ))}
                      </select>

                      <input
                        type="number"
                        min="1"
                        max="50"
                        className="quick-add-qty"
                        value={addQuantity}
                        onChange={(e) => setAddQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                      />

                      <button type="submit" className="btn-primary" disabled={addingProduct}>
                        {addingProduct ? "Adding..." : "+ Add to Shared Cart"}
                      </button>
                    </form>
                  </div>
                )}

                {/* Shared Cart Items & Summary Grid */}
                {roomData.items.length === 0 ? (
                  <div className="status-container" style={{ padding: "40px 20px" }}>
                    <p className="status-title">The Shared Cart is Empty</p>
                    <p className="status-text">
                      No products have been added yet. Choose a product from the selector above to add
                      items with your group!
                    </p>
                  </div>
                ) : (
                  <div className="cart-layout" style={{ marginTop: "20px" }}>
                    {/* Items List */}
                    <div className="cart-list">
                      {roomData.items.map((item) => {
                        const pId = item.productId;
                        const image = getProductImage(item);

                        return (
                          <div className="cart-item shared-item" key={pId}>
                            <div className="cart-image-container">
                              <img src={image} alt={item.name} className="cart-image" />
                            </div>

                            <div className="cart-details">
                              <h4 className="cart-details-title">{item.name || item.productName}</h4>
                              <p className="cart-details-price">
                                ${Number(item.price).toFixed(2)} each &bull;{" "}
                                <span className="added-by-tag">
                                  👤 Added by: <strong>{item.addedByUsername || "Member"}</strong>
                                </span>
                              </p>

                              {roomData.status === "active" && (
                                <div className="cart-controls">
                                  <button
                                    type="button"
                                    className="qty-btn"
                                    onClick={() => handleUpdateQuantity(pId, item.quantity - 1)}
                                    aria-label="Decrease quantity"
                                  >
                                    -
                                  </button>
                                  <span className="qty-display">{item.quantity}</span>
                                  <button
                                    type="button"
                                    className="qty-btn"
                                    onClick={() => handleUpdateQuantity(pId, item.quantity + 1)}
                                    aria-label="Increase quantity"
                                  >
                                    +
                                  </button>

                                  <button
                                    type="button"
                                    className="remove-btn"
                                    onClick={() => handleRemoveProduct(pId)}
                                  >
                                    Remove
                                  </button>
                                </div>
                              )}
                            </div>

                            <div className="cart-subtotal">${Number(item.subtotal).toFixed(2)}</div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Shared Order Summary */}
                    <div className="cart-summary-card">
                      <h3 className="summary-heading">Shared Cart Summary</h3>

                      <div className="summary-row">
                        <span>Total Items</span>
                        <span>{totalSharedItems}</span>
                      </div>

                      <div className="summary-row">
                        <span>Participants</span>
                        <span>{roomData.members?.length} members</span>
                      </div>

                      <div className="summary-total">
                        <span>Group Total</span>
                        <span className="font-mono">${roomData.cartTotal.toFixed(2)}</span>
                      </div>

                      {/* Checkout Initiation (Creator Only) */}
                      {roomData.status === "active" ? (
                        <>
                          <button
                            type="button"
                            className="checkout-btn"
                            onClick={handleCheckout}
                            disabled={!isCreator}
                            title={
                              isCreator
                                ? "Place group order"
                                : `Only creator (${roomData.createdBy?.username}) can checkout`
                            }
                          >
                            {isCreator ? "Proceed to Checkout" : "Checkout (Creator Only)"}
                          </button>

                          {!isCreator && (
                            <p className="creator-only-notice">
                              ℹ️ Only the room creator (<strong>{roomData.createdBy?.username}</strong>)
                              has permission to initiate final checkout.
                            </p>
                          )}
                        </>
                      ) : (
                        <div className="closed-room-badge">
                          ✓ This shared cart order was completed and the room is closed.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default SharedCart;

