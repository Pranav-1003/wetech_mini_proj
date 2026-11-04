import { Link, useNavigate } from "react-router-dom";

function Navbar({ currentUser, onLogout, cartCount = 0 }) {
  const navigate = useNavigate();

  const handleLogoutClick = () => {
    if (onLogout) {
      onLogout();
    }
    navigate("/login");
  };

  return (
    <header className="site-header">
      <div className="header-inner">
        <Link to="/" className="brand-logo">
          <span className="brand-text">Shopping App</span>
        </Link>

        <nav className="header-nav">
          {!currentUser ? (
            <>

            </>
          ) : (
            <>
              <Link to="/products" className="nav-link">
                Products
              </Link>
              <Link to="/profile" className="nav-link">
                Profile Management
              </Link>
              <Link to="/manage" className="nav-link">
                Inventory
              </Link>
              <Link to="/cart" className="nav-link cart-pill">
                Cart ({cartCount})
              </Link>
            </>
          )}
        </nav>

        <div className="header-user">
          {currentUser ? (
            <div className="user-logged-box">
              <span className="user-greeting">
                Signed in as: <strong>{currentUser.username}</strong>
              </span>
              <button onClick={handleLogoutClick} className="logout-btn">
                Sign Out
              </button>
            </div>
          ) : (
            <div className="auth-action-buttons">
              <Link to="/login" className="btn-nav-login">
                Login
              </Link>
              <Link to="/register" className="btn-nav-register">
                Register
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default Navbar;
