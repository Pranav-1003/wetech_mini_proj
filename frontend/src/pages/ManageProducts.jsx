import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { API_PRODUCTS_URL, getAuthHeaders, getItemId } from "../api";
import "../App.css";

function ManageProducts() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [actionMessage, setActionMessage] = useState(null);

  const fetchProducts = () => {
    setLoading(true);
    fetch(API_PRODUCTS_URL, {
      headers: getAuthHeaders()
    }).
    then((res) => {
      if (!res.ok) {
        throw new Error(`Failed to load products: ${res.status}`);
      }
      return res.json();
    }).
    then((data) => {
      setProducts(Array.isArray(data) ? data : []);
      setLoading(false);
    }).
    catch((err) => {
      console.error("Error fetching products:", err);
      setError(err.message || "Failed to load products.");
      setLoading(false);
    });
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleDelete = (productId, productName) => {
    const confirmDelete = window.confirm(
      `Are you sure you want to delete "${productName}" (ID: ${productId})? This action cannot be undone.`
    );
    if (!confirmDelete) return;

    fetch(`${API_PRODUCTS_URL}/${productId}`, {
      method: "DELETE",
      headers: getAuthHeaders()
    }).
    then((response) => {
      if (!response.ok && response.status !== 204) {
        throw new Error(`Failed to delete product (Status ${response.status})`);
      }
      setProducts((prev) => prev.filter((p) => getItemId(p) !== productId));
      setActionMessage({
        type: "success",
        text: `Product "${productName}" deleted successfully!`
      });
      setTimeout(() => setActionMessage(null), 3000);
    }).
    catch((err) => {
      console.error("Delete error:", err);
      setActionMessage({
        type: "error",
        text: err.message || "Failed to delete product."
      });
    });
  };

  const filteredProducts = products.filter((p) => {
    const pId = String(getItemId(p)).toLowerCase();
    const name = String(p.productName || p.name || "").toLowerCase();
    const cat = String(p.category || "").toLowerCase();
    const query = searchTerm.toLowerCase();
    return pId.includes(query) || name.includes(query) || cat.includes(query);
  });

  return (
    <div className="page">
      <div className="top-bar">
        <h1>Inventory Management</h1>
        <div className="nav-actions">
          <Link to="/products" className="btn-secondary">
            View Products Catalog
          </Link>
          <Link to="/add-product" className="btn-primary">
            Add New Product
          </Link>
        </div>
      </div>

      {actionMessage &&
      <div
        className={`alert ${
        actionMessage.type === "success" ? "alert-success" : "alert-error"}`
        }>
        
          <span>{actionMessage.text}</span>
        </div>
      }

      <div className="toolbar">
        <input
          type="text"
          className="search-input"
          placeholder="Search by ID, Name, or Category..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)} />
        
        <button className="btn-secondary" onClick={fetchProducts}>
          Refresh
        </button>
      </div>

      {loading &&
      <div className="status-container">
          <p className="status-title">Loading inventory...</p>
        </div>
      }

      {error && !loading &&
      <div className="status-container error-state">
          <p className="status-title">Failed to Load Products</p>
          <p className="status-text">{error}</p>
          <button className="btn-primary" onClick={fetchProducts}>
            Retry
          </button>
        </div>
      }

      {!loading && !error && filteredProducts.length === 0 &&
      <div className="status-container empty-state">
          <p className="status-title">No products found</p>
          <p className="status-text">
            {searchTerm ?
          "No products matched your search filter." :
          "No products found. Click Add New Product to create one."}
          </p>
        </div>
      }

      {!loading && !error && filteredProducts.length > 0 &&
      <div className="table-responsive">
          <table className="inventory-table">
            <thead>
              <tr>
                <th>Product ID</th>
                <th>Product Name</th>
                <th>Category</th>
                <th>Price</th>
                <th>Quantity</th>
                <th>Description</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((p) => {
              const pId = getItemId(p);
              const pName = p.productName || p.name || "N/A";
              const pPrice = Number(p.productPrice ?? p.price ?? 0);
              const pCat = p.category || "General";
              const pQty = p.quantity !== undefined ? p.quantity : "N/A";
              const pDesc = p.description || "-";

              return (
                <tr key={pId}>
                    <td>
                      <span className="font-mono badge-id">{pId}</span>
                    </td>
                    <td>
                      <strong>{pName}</strong>
                    </td>
                    <td>
                      <span className="category-pill">{pCat}</span>
                    </td>
                    <td>${pPrice.toFixed(2)}</td>
                    <td>
                      <span className={`stock-pill ${pQty === 0 ? "out" : ""}`}>
                        {pQty} units
                      </span>
                    </td>
                    <td className="desc-cell" title={pDesc}>
                      {pDesc}
                    </td>
                    <td>
                      <div className="table-actions">
                        <Link to={`/edit-product/${pId}`} className="btn-edit">
                          Edit
                        </Link>
                        <button
                        type="button"
                        className="btn-delete"
                        onClick={() => handleDelete(pId, pName)}>
                        
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>);

            })}
            </tbody>
          </table>
        </div>
      }
    </div>);

}

export default ManageProducts;