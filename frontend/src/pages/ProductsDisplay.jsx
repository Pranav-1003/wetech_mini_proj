import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API_PRODUCTS_URL, getAuthHeaders, getItemId, getProductImage } from "../api";
import Navbar from "../components/Navbar";
import "../App.css";

function ProductsDisplay({ currentUser, onLogout, cart = [], addToCart }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [addedNotice, setAddedNotice] = useState({});

  // Search & Filter States
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [priceFilter, setPriceFilter] = useState("all");
  const [quantityFilter, setQuantityFilter] = useState("all");
  const [sortBy, setSortBy] = useState("default");

  const navigate = useNavigate();

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError(null);
    setUnauthorized(false);

    fetch(API_PRODUCTS_URL, {
      method: "GET",
      headers: getAuthHeaders(),
    })
      .then(async (res) => {
        if (res.status === 401 || res.status === 403) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || "401_UNAUTHORIZED");
        }
        if (!res.ok) {
          throw new Error(`Failed to fetch products: HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        if (!ignore) {
          setProducts(Array.isArray(data) ? data : []);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          console.error("Products retrieval error:", err);
          if (
            err.message.includes("401") ||
            err.message.toLowerCase().includes("unauthorized") ||
            err.message.toLowerCase().includes("log in")
          ) {
            setUnauthorized(true);
          } else {
            setError(err.message || "Failed to retrieve products from backend.");
          }
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  const handleAdd = (e, product) => {
    e.stopPropagation();
    const pId = getItemId(product);
    if (addToCart) {
      addToCart(product);
    }
    setAddedNotice((prev) => ({ ...prev, [pId]: true }));
    setTimeout(() => {
      setAddedNotice((prev) => ({ ...prev, [pId]: false }));
    }, 1500);
  };

  // Extract unique categories dynamically from products
  const categories = useMemo(() => {
    const list = products
      .map((p) => p.category)
      .filter((cat) => typeof cat === "string" && cat.trim() !== "");
    return ["all", ...Array.from(new Set(list))];
  }, [products]);

  // Apply Search, Filters, and Sorting
  const filteredProducts = useMemo(() => {
    let result = products.filter((p) => {
      const pId = String(getItemId(p)).toLowerCase();
      const pName = String(p.productName || p.name || "").toLowerCase();
      const pDesc = String(p.description || "").toLowerCase();
      const pCat = String(p.category || "").toLowerCase();
      const pPrice = Number(p.productPrice ?? p.price ?? 0);
      const pQty = Number(p.quantity ?? 0);

      // 1. Search Query (matches name, ID, category, or description)
      const q = searchTerm.trim().toLowerCase();
      if (q && !pName.includes(q) && !pId.includes(q) && !pDesc.includes(q) && !pCat.includes(q)) {
        return false;
      }

      // 2. Category Filter
      if (selectedCategory !== "all" && pCat !== selectedCategory.toLowerCase()) {
        return false;
      }

      // 3. Price Filter
      if (priceFilter === "under-25" && pPrice >= 25) return false;
      if (priceFilter === "25-50" && (pPrice < 25 || pPrice > 50)) return false;
      if (priceFilter === "50-100" && (pPrice < 50 || pPrice > 100)) return false;
      if (priceFilter === "above-100" && pPrice <= 100) return false;

      // 4. Quantity Filter
      if (quantityFilter === "in-stock" && pQty <= 0) return false;
      if (quantityFilter === "low-stock" && (pQty <= 0 || pQty > 10)) return false;
      if (quantityFilter === "high-stock" && pQty < 15) return false;
      if (quantityFilter === "out-of-stock" && pQty > 0) return false;

      return true;
    });

    // 5. Sorting
    if (sortBy === "price-low") {
      result.sort((a, b) => (a.productPrice ?? a.price ?? 0) - (b.productPrice ?? b.price ?? 0));
    } else if (sortBy === "price-high") {
      result.sort((a, b) => (b.productPrice ?? b.price ?? 0) - (a.productPrice ?? a.price ?? 0));
    } else if (sortBy === "name-asc") {
      result.sort((a, b) =>
        String(a.productName || a.name || "").localeCompare(String(b.productName || b.name || ""))
      );
    }

    return result;
  }, [products, searchTerm, selectedCategory, priceFilter, quantityFilter, sortBy]);

  const hasActiveFilters =
    searchTerm !== "" ||
    selectedCategory !== "all" ||
    priceFilter !== "all" ||
    quantityFilter !== "all" ||
    sortBy !== "default";

  const handleResetFilters = () => {
    setSearchTerm("");
    setSelectedCategory("all");
    setPriceFilter("all");
    setQuantityFilter("all");
    setSortBy("default");
  };

  const totalCartCount = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);

  return (
    <div className="page-wrapper">
      <Navbar
        currentUser={currentUser}
        onLogout={onLogout}
        cartCount={totalCartCount}
      />

      <main className="content-container">
        <div className="page-header-banner">
          <div>
            <h2>Products Catalog</h2>
            <p className="subtext">
              Browse products fetched from MongoDB via HTTP GET.
            </p>
          </div>
          {currentUser && (
            <div className="user-status-pill">
              <span className="dot online"></span>
              <span>
                Signed in as: <strong>{currentUser.username}</strong> ({currentUser.emailId})
              </span>
            </div>
          )}
        </div>

        {unauthorized && (
          <div className="unauthorized-card">
            <h3>Authentication Required</h3>
            <p>
              Unauthenticated users cannot access product data directly through the backend API.
            </p>
            <p className="unauth-sub">
              Please sign in with your registered credentials to view products.
            </p>
            <div className="unauth-actions">
              <button className="btn-primary" onClick={() => navigate("/login")}>
                Go to Login
              </button>
              <button className="btn-secondary" onClick={() => navigate("/register")}>
                Register Account
              </button>
            </div>
          </div>
        )}

        {loading && !unauthorized && (
          <div className="status-container">
            <div className="spinner"></div>
            <p className="status-title">Retrieving products...</p>
            <p className="status-text">Fetching data from backend Products collection...</p>
          </div>
        )}

        {error && !loading && !unauthorized && (
          <div className="status-container error-state">
            <p className="status-title">Unable to Load Products</p>
            <p className="status-text">{error}</p>
            <button className="btn-primary" onClick={() => window.location.reload()}>
              Retry
            </button>
          </div>
        )}

        {!loading && !error && !unauthorized && products.length === 0 && (
          <div className="status-container empty-state">
            <p className="status-title">No products available.</p>
            <p className="status-text">
              The Products collection in MongoDB is currently empty.
            </p>
            <Link to="/add-product" className="btn-primary mt-2">
              Add a Product
            </Link>
          </div>
        )}

        {/* Search & Filter Toolbar */}
        {!loading && !error && !unauthorized && products.length > 0 && (
          <div className="catalog-toolbar">
            {/* Search Input Bar */}
            <div className="search-bar-row">
              <input
                type="text"
                placeholder="Search products by name, ID, description, or category..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="catalog-search-input"
              />
              {searchTerm && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => setSearchTerm("")}
                >
                  Clear
                </button>
              )}
            </div>

            {/* Filters Row: Category, Price, Quantity & Sort */}
            <div className="filters-row">
              {/* Category Filter */}
              <div className="filter-item">
                <label htmlFor="filter-cat">Category:</label>
                <select
                  id="filter-cat"
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="filter-select"
                >
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat === "all" ? "All Categories" : cat}
                    </option>
                  ))}
                </select>
              </div>

              {/* Price Filter */}
              <div className="filter-item">
                <label htmlFor="filter-price">Price:</label>
                <select
                  id="filter-price"
                  value={priceFilter}
                  onChange={(e) => setPriceFilter(e.target.value)}
                  className="filter-select"
                >
                  <option value="all">All Prices</option>
                  <option value="under-25">Under $25</option>
                  <option value="25-50">$25 - $50</option>
                  <option value="50-100">$50 - $100</option>
                  <option value="above-100">Above $100</option>
                </select>
              </div>

              {/* Quantity Filter */}
              <div className="filter-item">
                <label htmlFor="filter-qty">Quantity:</label>
                <select
                  id="filter-qty"
                  value={quantityFilter}
                  onChange={(e) => setQuantityFilter(e.target.value)}
                  className="filter-select"
                >
                  <option value="all">All Stock Levels</option>
                  <option value="in-stock">In Stock (&gt; 0)</option>
                  <option value="low-stock">Low Stock (1 - 10)</option>
                  <option value="high-stock">High Stock (&gt;= 15)</option>
                  <option value="out-of-stock">Out of Stock (0)</option>
                </select>
              </div>

              {/* Sort By */}
              <div className="filter-item">
                <label htmlFor="filter-sort">Sort by:</label>
                <select
                  id="filter-sort"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="filter-select"
                >
                  <option value="default">Default</option>
                  <option value="price-low">Price: Low to High</option>
                  <option value="price-high">Price: High to Low</option>
                  <option value="name-asc">Name: A to Z</option>
                </select>
              </div>

              {/* Reset Filters Button */}
              {hasActiveFilters && (
                <div className="filter-reset-wrap">
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="btn-reset-filters"
                  >
                    Reset Filters
                  </button>
                </div>
              )}
            </div>

            {/* Results count text */}
            <div className="results-count-bar">
              Showing <strong>{filteredProducts.length}</strong> of{" "}
              <strong>{products.length}</strong> products
            </div>
          </div>
        )}

        {/* No Matches Found State */}
        {!loading &&
          !error &&
          !unauthorized &&
          products.length > 0 &&
          filteredProducts.length === 0 && (
            <div className="status-container empty-state">
              <p className="status-title">No matching products found</p>
              <p className="status-text">
                Try adjusting your search keywords or filter criteria.
              </p>
              <button
                type="button"
                className="btn-secondary mt-2"
                onClick={handleResetFilters}
              >
                Clear All Filters
              </button>
            </div>
          )}

        {/* Products Grid */}
        {!loading && !error && !unauthorized && filteredProducts.length > 0 && (
          <div className="product-catalog-grid">
            {filteredProducts.map((product) => {
              const pId = getItemId(product);
              const pName = product.productName || product.name || "Unnamed Product";
              const pPrice = Number(product.productPrice ?? product.price ?? 0);
              const pCategory = product.category || "General";
              const pQuantity = product.quantity !== undefined ? product.quantity : "N/A";
              const pDescription = product.description || "No description provided.";
              const isAdded = addedNotice[pId];

              return (
                <div className="product-spec-card" key={pId}>
                  <div className="product-card-top">
                    <span className="category-pill">{pCategory}</span>
                    <span className="product-id-badge">ID: {pId}</span>
                  </div>

                  <div className="product-image-box">
                    <img
                      src={getProductImage(product)}
                      alt={pName}
                      className="product-spec-img"
                    />
                  </div>

                  <div className="product-spec-content">
                    <h3 className="product-name" title={pName}>
                      {pName}
                    </h3>

                    <p className="product-description">{pDescription}</p>

                    <div className="product-meta-row">
                      <div className="price-tag">
                        <span className="currency">$</span>
                        <span className="amount">{pPrice.toFixed(2)}</span>
                      </div>

                      <div className="stock-info">
                        <span className="stock-label">Available Qty:</span>
                        <span
                          className={`stock-count ${
                            pQuantity === 0 ? "out-of-stock" : ""
                          }`}
                        >
                          {pQuantity}
                        </span>
                      </div>
                    </div>

                    <div className="spec-table">
                      <div className="spec-row">
                        <span className="spec-key">Product ID:</span>
                        <span className="spec-val font-mono">{pId}</span>
                      </div>
                      <div className="spec-row">
                        <span className="spec-key">Product Name:</span>
                        <span className="spec-val">{pName}</span>
                      </div>
                      <div className="spec-row">
                        <span className="spec-key">Product Price:</span>
                        <span className="spec-val">${pPrice.toFixed(2)}</span>
                      </div>
                      <div className="spec-row">
                        <span className="spec-key">Category:</span>
                        <span className="spec-val">{pCategory}</span>
                      </div>
                      <div className="spec-row">
                        <span className="spec-key">Available Quantity:</span>
                        <span className="spec-val">{pQuantity} units</span>
                      </div>
                      <div className="spec-row">
                        <span className="spec-key">Description:</span>
                        <span className="spec-val desc-preview">{pDescription}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      className={`btn-add-cart ${isAdded ? "btn-added" : ""}`}
                      onClick={(e) => handleAdd(e, product)}
                      disabled={pQuantity === 0}
                    >
                      {pQuantity === 0
                        ? "Out of Stock"
                        : isAdded
                        ? "Added to Cart"
                        : "Add to Cart"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

export default ProductsDisplay;
