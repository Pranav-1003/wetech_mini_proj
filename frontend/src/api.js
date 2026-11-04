export const API_BASE = "http://localhost:3000";
export const API_PRODUCTS_URL = "http://localhost:3000/api/products";
export const API_USERS_URL = "http://localhost:3000/api/users";
export const API_LOGIN_URL = "http://localhost:3000/api/login";
export const API_ORDERS_URL = "http://localhost:3000/api/orders";

export const API_BASE_URL = API_PRODUCTS_URL;
export const DEFAULT_IMAGE = "https://static.thenounproject.com/png/1077596-200.png";

export const getItemId = (item) => (item ? item.productId || item._id || item.id : "");

// Mapping from Product ID / Name to local downloaded images in frontend
export const PRODUCT_IMAGE_MAP = {
  P1: "/images/casual shirt.jpeg",
  P2: "/images/formal pant.jpeg",
  P101: "/images/cotton polo t-shirt.jpg",
  P102: "/images/Slim-Fit Denim Jeans.webp",
  P103: "/images/wireless bluetooth headphone.png",
  P104: "/images/Smart Fitness Watch.jpeg",
  P105: "/images/Pro Running Shoes.avif",
  P106: "/images/Insulated Stainless Steel Bottle.jpeg",
};

export const getProductImage = (product) => {
  if (!product) return DEFAULT_IMAGE;

  // 1. Direct image field if present
  if (product.image && typeof product.image === "string" && product.image.trim() !== "") {
    return product.image;
  }

  // 2. Lookup by Product ID
  const pId = String(getItemId(product)).trim();
  if (PRODUCT_IMAGE_MAP[pId]) {
    return PRODUCT_IMAGE_MAP[pId];
  }

  // 3. Fallback lookup by product name keywords
  const name = String(product.productName || product.name || "").toLowerCase().trim();
  if (name.includes("polo") || name.includes("t-shirt")) return "/images/cotton polo t-shirt.jpg";
  if (name.includes("jeans") || name.includes("denim")) return "/images/Slim-Fit Denim Jeans.webp";
  if (name.includes("headphone") || name.includes("bluetooth")) return "/images/wireless bluetooth headphone.png";
  if (name.includes("watch") || name.includes("fitness")) return "/images/Smart Fitness Watch.jpeg";
  if (name.includes("running") || name.includes("shoes")) return "/images/Pro Running Shoes.avif";
  if (name.includes("bottle") || name.includes("steel")) return "/images/Insulated Stainless Steel Bottle.jpeg";
  if (name.includes("shirt")) return "/images/casual shirt.jpeg";
  if (name.includes("pant")) return "/images/formal pant.jpeg";

  return DEFAULT_IMAGE;
};

export const getAuthHeaders = () => {
  const token = localStorage.getItem("lab8_token");
  const user = JSON.parse(localStorage.getItem("lab8_user") || "null");
  const headers = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  if (user && user.emailId) {
    headers["x-user-email"] = user.emailId;
  }
  return headers;
};
