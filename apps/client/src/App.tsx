import { Navigate, Route, Routes } from "react-router-dom";
import { CartProvider } from "./cart/cart-context";
import { AppLayout } from "./components/AppLayout";
import { AuthRouteLayout } from "./components/AuthRouteLayout";
import { CartPage } from "./pages/CartPage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { OtpPage } from "./pages/OtpPage";
import { RegisterPage } from "./pages/RegisterPage";
import { ShopPage } from "./pages/ShopPage";
import { PaywallProvider } from "./paywall/paywall-context";
import "./styles.css";

export default function App() {
  return (
    <PaywallProvider>
      <CartProvider>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/shop" element={<ShopPage />} />
            <Route path="/cart" element={<CartPage />} />
          </Route>
          <Route element={<AuthRouteLayout />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/otp" element={<OtpPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </CartProvider>
    </PaywallProvider>
  );
}
