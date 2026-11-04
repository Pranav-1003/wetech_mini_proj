import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API_PRODUCTS_URL, getAuthHeaders } from "../api";
import Navbar from "../components/Navbar";
import "../App.css";

function AddProduct({ currentUser, onLogout }) {
  const [formData, setFormData] = useState({
    productId: "",
    productName: "",
    productPrice: "",
    category: "",
    quantity: "",
    description: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setSuccessMessage("");
    setErrorMessage("");

    if (
      !formData.productId.trim() ||
      !formData.productName.trim() ||
      !formData.productPrice ||
      !formData.category.trim() ||
      formData.quantity === "" ||
      !formData.description.trim()
    ) {
      setErrorMessage("Please fill in all product fields.");
      return;
    }

    setSubmitting(true);

    const payload = {
      productId: formData.productId.trim(),
      productName: formData.productName.trim(),
      productPrice: Number(formData.productPrice),
      category: formData.category.trim(),
      quantity: Number(formData.quantity),
      description: formData.description.trim(),
      name: formData.productName.trim(),
      price: Number(formData.productPrice),
    };

    fetch(API_PRODUCTS_URL, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    })
      .then(async (response) => {
        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          const errorText = errorData?.message || `Failed to add product (HTTP ${response.status})`;
          throw new Error(errorText);
        }
        return response.json();
      })
      .then(() => {
        setSubmitting(false);
        setSuccessMessage("Product added successfully.");
        setFormData({
          productId: "",
          productName: "",
          productPrice: "",
          category: "",
          quantity: "",
          description: "",
        });
        setTimeout(() => {
          navigate("/products");
        }, 1000);
      })
      .catch((err) => {
        console.error("Error creating product:", err);
        setSubmitting(false);
        setErrorMessage(
          err.message.includes("E11000")
            ? "A product with this Product ID already exists. Please use a unique ID."
            : err.message || "Failed to create product."
        );
      });
  };

  return (
    <div className="page-wrapper">
      <Navbar currentUser={currentUser} onLogout={onLogout} />

      <main className="content-container">
        <div className="page-header-banner">
          <div>
            <h2>Add New Product</h2>
            <p className="subtext">
              Create a new product record in MongoDB.
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
          {successMessage && (
            <div className="alert alert-success">
              <span>{successMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div className="alert alert-error">
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="clean-form">
            <div className="clean-form-group">
              <label htmlFor="productId">
                Product ID <span className="req">*</span>
              </label>
              <input
                id="productId"
                name="productId"
                type="text"
                placeholder="e.g. P107"
                value={formData.productId}
                onChange={handleChange}
                className="clean-input"
                disabled={submitting}
                required
              />
            </div>

            <div className="clean-form-group">
              <label htmlFor="productName">
                Product Name <span className="req">*</span>
              </label>
              <input
                id="productName"
                name="productName"
                type="text"
                placeholder="Enter product name"
                value={formData.productName}
                onChange={handleChange}
                className="clean-input"
                disabled={submitting}
                required
              />
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
                placeholder="0.00"
                value={formData.productPrice}
                onChange={handleChange}
                className="clean-input"
                disabled={submitting}
                required
              />
            </div>

            <div className="clean-form-group">
              <label htmlFor="category">
                Category <span className="req">*</span>
              </label>
              <input
                id="category"
                name="category"
                type="text"
                placeholder="e.g. Electronics, Apparel, Footwear"
                value={formData.category}
                onChange={handleChange}
                className="clean-input"
                disabled={submitting}
                required
              />
            </div>

            <div className="clean-form-group">
              <label htmlFor="quantity">
                Available Quantity <span className="req">*</span>
              </label>
              <input
                id="quantity"
                name="quantity"
                type="number"
                min="0"
                placeholder="e.g. 20"
                value={formData.quantity}
                onChange={handleChange}
                className="clean-input"
                disabled={submitting}
                required
              />
            </div>

            <div className="clean-form-group">
              <label htmlFor="description">
                Description <span className="req">*</span>
              </label>
              <textarea
                id="description"
                name="description"
                rows="4"
                placeholder="Enter product description"
                value={formData.description}
                onChange={handleChange}
                className="clean-textarea"
                disabled={submitting}
                required
              />
            </div>

            <div className="clean-form-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => navigate("/products")}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={submitting}
              >
                {submitting ? "Adding..." : "Add Product"}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}

export default AddProduct;
