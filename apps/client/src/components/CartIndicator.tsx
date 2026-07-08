import { useLocation, useNavigate } from "react-router-dom";
import { Button, Icon } from "@koz/ui";
import { useCart } from "../cart/cart-context";
import { formatCurrency } from "../utils/format";

export function CartIndicator() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { itemCount, subtotal } = useCart();

  if (pathname === "/cart" || itemCount === 0) return null;

  return (
    <div className="cart-indicator">
      <Button
        type="button"
        fullWidth
        leftIcon={<Icon name="cart" size={20} />}
        onClick={() => navigate("/cart")}
      >
        В корзине {itemCount} · {formatCurrency(subtotal)}
      </Button>
    </div>
  );
}
