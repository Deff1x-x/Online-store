import { NavLink } from "react-router-dom";
import { Header, Icon } from "@koz/ui";
import { useCart } from "../cart/cart-context";

export function AppHeader() {
  const { itemCount } = useCart();

  return (
    <Header className="client-header">
      <NavLink className="client-brand" to="/" aria-label="Клуб оптовых цен">
        <span>КЛУБ</span>
        <small>Оптовых Цен</small>
      </NavLink>
      <nav className="client-nav" aria-label="Основная навигация">
        <NavLink to="/shop">
          <Icon name="store" size={20} />
          <span>Витрина</span>
        </NavLink>
        <NavLink className="cart-link" to="/cart">
          <Icon name="cart" size={20} />
          <span>Корзина</span>
          {itemCount > 0 ? <span className="cart-count">{itemCount}</span> : null}
        </NavLink>
      </nav>
    </Header>
  );
}
