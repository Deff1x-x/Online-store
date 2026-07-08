import { useNavigate } from "react-router-dom";
import {
  Button,
  Card,
  Divider,
  EmptyState,
  H1,
  Icon,
  Input,
  PageContainer,
} from "@koz/ui";
import { useCart } from "../cart/cart-context";
import { ProductVisual } from "../components/ProductVisual";
import { QuantityControl } from "../components/QuantityControl";
import { formatCurrency } from "../utils/format";

// FREE/DELIV синхронны с delivery_settings точки, пока отдельного endpoint для клиентских настроек нет.
const FREE = 5000;
const DELIV = 500;
const ONLINE_SHARE = 0.8;

export function CartPage() {
  const navigate = useNavigate();
  const { items, subtotal, updateQuantity, removeProduct } = useCart();
  const deliveryFee = subtotal < FREE ? DELIV : 0;
  const finalTotal = subtotal + deliveryFee;
  const onlineAmount = Math.round(finalTotal * ONLINE_SHARE * 100) / 100;
  const posRemainder = Math.round((finalTotal - onlineAmount) * 100) / 100;
  const amountToFreeDelivery = Math.max(FREE - subtotal, 0);
  const deliveryProgress = Math.min((subtotal / FREE) * 100, 100);

  if (items.length === 0) {
    return (
      <PageContainer className="cart-page">
        <H1>Корзина</H1>
        <EmptyState
          title="Корзина пока пустая"
          description="Добавьте продукты из витрины."
          action={
            <Button type="button" onClick={() => navigate("/shop")}>
              Перейти в витрину
            </Button>
          }
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer className="cart-page">
      <header className="page-heading">
        <span className="page-kicker">Проверьте количество перед оформлением</span>
        <H1>Корзина</H1>
      </header>
      <div className="cart-layout">
        <section className="cart-items" aria-label="Товары в корзине">
          {items.map((item) => (
            <Card className="cart-item" key={item.product_id}>
              <ProductVisual category={item.category} compact />
              <div className="cart-item__info">
                <strong>{item.name}</strong>
                <span>
                  {formatCurrency(Number(item.price_per_unit))} / {item.is_weighted ? "кг" : "шт"}
                </span>
                {item.is_weighted ? (
                  <small>итог по факту веса ±10%</small>
                ) : null}
              </div>
              <QuantityControl
                quantity={item.cartQuantity}
                isWeighted={item.is_weighted}
                onChange={(quantity) => updateQuantity(item.product_id, quantity)}
              />
              <strong className="cart-item__total">
                {formatCurrency(Number(item.price_per_unit) * item.cartQuantity)}
              </strong>
              <button
                className="remove-button"
                type="button"
                aria-label={`Удалить ${item.name}`}
                onClick={() => removeProduct(item.product_id)}
              >
                <Icon name="trash" size={22} />
              </button>
            </Card>
          ))}

          <div className="delivery-progress">
            <div className="delivery-progress__copy">
              <Icon name="truck" size={22} />
              <strong>
                {amountToFreeDelivery > 0
                  ? `Ещё ${formatCurrency(amountToFreeDelivery)} до бесплатной доставки`
                  : "Доставка бесплатная"}
              </strong>
            </div>
            <div className="delivery-progress__track" aria-hidden="true">
              <span style={{ "--delivery-progress": `${deliveryProgress}%` } as React.CSSProperties} />
            </div>
          </div>
        </section>

        <aside className="cart-summary" aria-label="Итоги корзины">
          <Card className="summary-card">
            <h2>Ваш заказ</h2>
            <label className="promo-field">
              <span>Промокод</span>
              <Input disabled placeholder="Будет доступен позже" />
            </label>
            <Divider />
            <dl className="price-list">
              <div>
                <dt>Товары</dt>
                <dd>{formatCurrency(subtotal)}</dd>
              </div>
              <div>
                <dt>Доставка</dt>
                <dd>{deliveryFee === 0 ? "Бесплатно" : formatCurrency(deliveryFee)}</dd>
              </div>
              <div className="price-list__total">
                <dt>Итого предварительно</dt>
                <dd>{formatCurrency(finalTotal)}</dd>
              </div>
            </dl>
            <div className="split-payment">
              <span className="split-payment__title">ОПЛАТА В ДВЕ ЧАСТИ</span>
              <div>
                <span>Сейчас на сайте — 80%</span>
                <strong>{formatCurrency(onlineAmount, 2)}</strong>
              </div>
              <div>
                <span>Курьеру на ПОС-терминал, по факту веса</span>
                <strong>~{formatCurrency(posRemainder, 2)}</strong>
              </div>
              <p>Итог станет окончательным после взвешивания</p>
            </div>
          </Card>
        </aside>
      </div>
    </PageContainer>
  );
}
