import { Navigate, Route, Routes } from "react-router-dom";
import { CartProvider } from "./cart/cart-context";
import { AppLayout } from "./components/AppLayout";
import { CartPage } from "./pages/CartPage";
import { HomePage } from "./pages/HomePage";
import { ShopPage } from "./pages/ShopPage";
import "./styles.css";

export default function App() {
  return (
    <CartProvider>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/shop" element={<ShopPage />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </CartProvider>
  );
}
