import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { CartProvider } from "./cart/cart-context";
import { AppLayout } from "./components/AppLayout";
import { AuthRouteLayout } from "./components/AuthRouteLayout";
import { HomePage } from "./pages/HomePage";
import { ShopPage } from "./pages/ShopPage";
import { PaywallProvider } from "./paywall/paywall-context";
import "./styles.css";

const CartPage = lazy(() => import("./pages/CartPage").then((m) => ({ default: m.CartPage })));
const CheckoutPage = lazy(() =>
  import("./pages/CheckoutPage").then((m) => ({ default: m.CheckoutPage })),
);
const OrderSuccessPage = lazy(() =>
  import("./pages/OrderSuccessPage").then((m) => ({ default: m.OrderSuccessPage })),
);
const OrdersPage = lazy(() => import("./pages/OrdersPage").then((m) => ({ default: m.OrdersPage })));
const ProfilePage = lazy(() =>
  import("./pages/ProfilePage").then((m) => ({ default: m.ProfilePage })),
);
const LoginPage = lazy(() => import("./pages/LoginPage").then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() =>
  import("./pages/RegisterPage").then((m) => ({ default: m.RegisterPage })),
);
const OtpPage = lazy(() => import("./pages/OtpPage").then((m) => ({ default: m.OtpPage })));

function RouteFallback() {
  return <div className="page-loading" aria-busy="true">Загрузка…</div>;
}

export default function App() {
  return (
    <PaywallProvider>
      <CartProvider>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/shop" element={<ShopPage />} />
              <Route path="/cart" element={<CartPage />} />
              <Route path="/checkout" element={<CheckoutPage />} />
              <Route path="/order-success" element={<OrderSuccessPage />} />
              <Route path="/orders" element={<OrdersPage />} />
              <Route path="/profile" element={<ProfilePage />} />
            </Route>
            <Route element={<AuthRouteLayout />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/otp" element={<OtpPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </CartProvider>
    </PaywallProvider>
  );
}
