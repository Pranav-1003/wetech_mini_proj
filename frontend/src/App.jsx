import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Register from "./pages/Register";
import Login from "./pages/Login";
import ProductsDisplay from "./pages/ProductsDisplay";
import UserProfile from "./pages/UserProfile";
import ProductDetails from "./pages/ProductDetails";
import Cart from "./pages/Cart";
import ManageProducts from "./pages/ManageProducts";
import AddProduct from "./pages/AddProduct";
import EditProduct from "./pages/EditProduct";
import MyReservations from "./pages/MyReservations";
import SharedCart from "./pages/SharedCart";
import { getItemId } from "./api";
import "./App.css";

function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem("lab8_user");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [cart, setCart] = useState(() => {
    try {
      const savedCart = localStorage.getItem("lab8_cart");
      return savedCart ? JSON.parse(savedCart) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem("lab8_cart", JSON.stringify(cart));
  }, [cart]);

  const handleLogout = () => {
    localStorage.removeItem("lab8_token");
    localStorage.removeItem("lab8_user");
    setCurrentUser(null);
  };

  const addToCart = (product, quantity = 1) => {
    const pId = getItemId(product);
    setCart((prevCart) => {
      const existingItem = prevCart.find((item) => getItemId(item) === pId);
      if (existingItem) {
        return prevCart.map((item) =>
        getItemId(item) === pId ?
        { ...item, quantity: (item.quantity || 1) + quantity } :
        item
        );
      }
      return [
      ...prevCart,
      {
        ...product,
        productId: pId,
        name: product.productName || product.name || pId,
        price: product.productPrice !== undefined ? product.productPrice : product.price || 0,
        quantity
      }];

    });
  };

  const removeFromCart = (productId) => {
    setCart((prevCart) => prevCart.filter((item) => getItemId(item) !== productId));
  };

  const updateQuantity = (productId, delta) => {
    setCart((prevCart) =>
    prevCart.
    map((item) => {
      if (getItemId(item) === productId) {
        const newQty = (item.quantity || 1) + delta;
        return newQty > 0 ? { ...item, quantity: newQty } : null;
      }
      return item;
    }).
    filter(Boolean)
    );
  };

  const clearCart = () => {
    setCart([]);
  };

  return (
    <BrowserRouter>
      <Routes>
        {}
        <Route
          path="/"
          element={
          currentUser ?
          <Navigate to="/products" replace /> :

          <Navigate to="/login" replace />

          } />
        

        {}
        <Route
          path="/register"
          element={
          <Register
            currentUser={currentUser}
            onLogout={handleLogout} />

          } />
        

        {}
        <Route
          path="/login"
          element={
          <Login
            currentUser={currentUser}
            setCurrentUser={setCurrentUser}
            onLogout={handleLogout} />

          } />
        

        {}
        <Route
          path="/products"
          element={
          <ProductsDisplay
            currentUser={currentUser}
            onLogout={handleLogout}
            cart={cart}
            addToCart={addToCart} />

          } />
        

        {}
        <Route
          path="/profile"
          element={
          <UserProfile
            currentUser={currentUser}
            setCurrentUser={setCurrentUser}
            onLogout={handleLogout} />

          } />
        

        {}
        <Route
          path="/product/:id"
          element={
          <ProductDetails
            cart={cart}
            setCart={setCart}
            addToCart={addToCart} />

          } />
        

        {}
        <Route
          path="/cart"
          element={
          <Cart
            currentUser={currentUser}
            onLogout={handleLogout}
            cart={cart}
            setCart={setCart}
            updateQuantity={updateQuantity}
            removeFromCart={removeFromCart}
            clearCart={clearCart} />

          } />
        

        {}
        <Route path="/manage" element={<ManageProducts />} />
        <Route
          path="/add-product"
          element={<AddProduct currentUser={currentUser} onLogout={handleLogout} />} />
        
        <Route
          path="/edit-product/:id"
          element={<EditProduct currentUser={currentUser} onLogout={handleLogout} />} />
        

        {}
        <Route
          path="/reservations"
          element={
          <MyReservations
            currentUser={currentUser}
            onLogout={handleLogout}
            cart={cart} />

          } />
        

        {}
        <Route
          path="/shared-cart"
          element={<SharedCart currentUser={currentUser} onLogout={handleLogout} />} />
        
        <Route
          path="/shared-cart/:roomCode"
          element={<SharedCart currentUser={currentUser} onLogout={handleLogout} />} />
        

        {}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>);

}

export default App;