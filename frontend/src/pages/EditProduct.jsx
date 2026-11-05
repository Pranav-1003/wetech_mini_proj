import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { API_PRODUCTS_URL, getAuthHeaders } from "../api";
import Navbar from "../components/Navbar";
import "../App.css";

function EditProduct({ currentUser, onLogout }) {
  const { id } = useParams();
  const [formData, setFormData] = useState({
    productId: id || "",
    productName: "",
    productPrice: "",
    category: "",
    quantity: "",
    description: ""
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    let ignore = false;

    fetch(`${API_PRODUCTS_URL}/${id}`, {
      headers: getAuthHeaders()
    }).
    then((res) => {
      if (!res.ok) {
        throw new Error(`Failed to load product (${res.status})`);
      }
      return res.json();
    }).
    then((data) => {
      if (!ignore && data) {
        setFormData({
          productId: data.productId || id,
          productName: data.productName || data.name || "",
          productPrice:
          data.productPrice !== undefined ?
          String(data.productPrice) :
          data.price !== undefined ?
          String(data.price) :
          "",
          category: data.category || "General",
          quantity: data.quantity !== undefined ? String(data.quantity) : "0",
          description: data.description || ""
        });
        setLoading(false);
      }
    }).
    catch((err) => {
      if (!ignore) {
        console.error("Error loading product for edit:", err);
        setErrorMessage(err.message || "Failed to load product details.");
        setLoading(false);
      }
    });

    return () => {
      ignore = true;
    };
  }, [id]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setSuccessMessage("");
    setErrorMessage("");

    if (!formData.productName.trim() || !formData.productPrice) {
      setErrorMessage("Please fill in the required fields.");
      return;
    }

    setSubmitting(true);

    const payload = {
      productId: formData.productId,
      productName: formData.productName.trim(),
      productPrice: Number(formData.productPrice),
      category: formData.category.trim(),
      quantity: Number(formData.quantity || 0),
      description: formData.description.trim(),
      name: formData.productName.trim(),
      price: Number(formData.productPrice)
    };

    fetch(`${API_PRODUCTS_URL}/${id}`, {
      method: "PUT",
      headers: getAuthHeaders(),
      body: JSON.stringify(payload)
    }).
    then(async (response) => {
      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.message || `Failed to update product (${response.status})`);
      }
      return response.json();
    }).
    then(() => {
      setSubmitting(false);
      setSuccessMessage("Product updated successfully.");
      setTimeout(() => {
        navigate("/products");
      }, 1000);
    }).
    catch((err) => {
      console.error("Error updating product:", err);
      setSubmitting(false);
      setErrorMessage(err.message || "Failed to update product.");
    });
  };

  return (
    <div className="page-wrapper">
      <Navbar currentUser={currentUser} onLogout={onLogout} />

      <main className="content-container">
        <div className="page-header-banner">
          <div>
            <h2>Update Product Details</h2>
            <p className="subtext">
              Modify product information for ID: <strong>{id}</strong>
            </p>
          </div>
          <div className="nav-actions">
            <Link to="/manage" className="btn-secondary">
              Manage Inventory
            </Link>
            <Link to="/products" className="btn-secondary">
              View Products
            </Link>
          </div>
        </div>

        <div className="clean-form-card">
          {loading ?
          <div className="status-container">
              <p className="status-title">Loading product details...</p>
            </div> :

          <>
              {successMessage &&
            <div className="alert alert-success">
                  <span>{successMessage}</span>
                </div>
            }

              {errorMessage &&
            <div className="alert alert-error">
                  <span>{errorMessage}</span>
                </div>
            }

              <form onSubmit={handleSubmit} className="clean-form">
                <div className="clean-form-group">
                  <label htmlFor="productId">Product ID</label>
                  <input
                  id="productId"
                  name="productId"
                  type="text"
                  value={formData.productId}
                  disabled
                  className="clean-input clean-input-disabled" />
                
                  <span className="field-hint">Unique identifier cannot be modified.</span>
                </div>

                <div className="clean-form-group">
                  <label htmlFor="productName">
                    Product Name <span className="req">*</span>
                  </label>
                  <input
                  id="productName"
                  name="productName"
                  type="text"
                  value={formData.productName}
                  onChange={handleChange}
                  placeholder="Enter product name"
                  className="clean-input"
                  disabled={submitting}
                  required />
                
                </div>

                <div className="clean-form-group">
                  <label htmlFor="productPrice">
                    Price ($) <span className="req">*</span>
                  </label>
                  <input
                  id="productPrice"
                  name="productPrice"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.productPrice}
                  onChange={handleChange}
                  placeholder="0.00"
                  className="clean-input"
                  disabled={submitting}
                  required />
                
                </div>

                <div className="clean-form-group">
                  <label htmlFor="category">Category</label>
                  <input
                  id="category"
                  name="category"
                  type="text"
                  value={formData.category}
                  onChange={handleChange}
                  placeholder="e.g. Clothing, Electronics"
                  className="clean-input"
                  disabled={submitting} />
                
                </div>

                <div className="clean-form-group">
                  <label htmlFor="quantity">Available Quantity</label>
                  <input
                  id="quantity"
                  name="quantity"
                  type="number"
                  min="0"
                  value={formData.quantity}
                  onChange={handleChange}
                  placeholder="Available stock"
                  className="clean-input"
                  disabled={submitting} />
                
                </div>

                <div className="clean-form-group">
                  <label htmlFor="description">Description</label>
                  <textarea
                  id="description"
                  name="description"
                  rows="4"
                  value={formData.description}
                  onChange={handleChange}
                  placeholder="Enter product description"
                  className="clean-textarea"
                  disabled={submitting} />
                
                </div>

                <div className="clean-form-actions">
                  <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => navigate("/products")}
                  disabled={submitting}>
                  
                    Cancel
                  </button>
                  <button
                  type="submit"
                  className="btn-primary"
                  disabled={submitting}>
                  
                    {submitting ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </form>
            </>
          }
        </div>
      </main>
    </div>);

}

export default EditProduct;