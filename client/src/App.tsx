import { BrowserRouter, Route, Routes } from "react-router";
import { AuthProvider } from "./auth";
import { ConfirmProvider } from "./components/ConfirmToast";
import { NotifyProvider } from "./components/Notify";
import Navbar from "./components/Navbar";
import RequireRole from "./components/RequireRole";
import AdminDashboard from "./pages/AdminDashboard";
import Bookings from "./pages/Bookings";
import Home from "./pages/Home";
import Login from "./pages/Login";
import PaymentResult from "./pages/PaymentResult";
import ProviderDashboard from "./pages/ProviderDashboard";
import Register from "./pages/Register";
import ServiceDetail from "./pages/ServiceDetail";

export default function App() {
  return (
    <BrowserRouter>
      <NotifyProvider>
        <AuthProvider>
          <ConfirmProvider>
            <Navbar />
            <main className="container">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/services/:id" element={<ServiceDetail />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/payment/:result" element={<PaymentResult />} />
                <Route
                  path="/bookings"
                  element={
                    <RequireRole roles={["CUSTOMER", "PROVIDER"]}>
                      <Bookings />
                    </RequireRole>
                  }
                />
                <Route
                  path="/provider"
                  element={
                    <RequireRole roles={["PROVIDER"]}>
                      <ProviderDashboard />
                    </RequireRole>
                  }
                />
                <Route
                  path="/admin"
                  element={
                    <RequireRole roles={["ADMIN"]}>
                      <AdminDashboard />
                    </RequireRole>
                  }
                />
                <Route path="*" element={<p className="muted">Page not found.</p>} />
              </Routes>
            </main>
          </ConfirmProvider>
        </AuthProvider>
      </NotifyProvider>
    </BrowserRouter>
  );
}
