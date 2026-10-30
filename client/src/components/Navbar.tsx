import { Link, NavLink, useNavigate } from "react-router";
import { useAuth } from "../auth";
import ThemeToggle from "./ThemeToggle";

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="navbar">
      <div className="container navbar-inner">
        <Link to="/" className="brand">
          🏠 HomeService
        </Link>
        <nav className="row">
          <NavLink to="/">Find services</NavLink>
          {(user?.role === "CUSTOMER" || user?.role === "PROVIDER") && (
            <NavLink to="/bookings">{user.role === "CUSTOMER" ? "My bookings" : "My jobs"}</NavLink>
          )}
          {user?.role === "PROVIDER" && <NavLink to="/provider">Dashboard</NavLink>}
          {user?.role === "ADMIN" && <NavLink to="/admin">Admin</NavLink>}
          {user ? (
            <button
              className="btn btn-ghost"
              onClick={() => {
                logout();
                navigate("/");
              }}
            >
              Log out ({user.name.split(" ")[0]})
            </button>
          ) : (
            <>
              <NavLink to="/login">Log in</NavLink>
              <Link to="/register" className="btn btn-primary">
                Sign up
              </Link>
            </>
          )}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
