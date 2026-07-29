import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import {
  Button,
  Card,
  Checkbox,
  Divider,
  Dropdown,
  EmptyState,
  H1,
  H2,
  PageContainer,
  Spinner,
  TextField,
} from "@koz/ui";
import { APIError, useApi, useAuth, useToast } from "@koz/api";
import { useCart } from "../cart/cart-context";
import { ProductVisual } from "../components/ProductVisual";
import { saveOrderResult } from "../orders/order-result";
import { usePaywall } from "../paywall/paywall-context";
import { paymentProvider } from "../payments/provider";
import { formatCurrency, formatQuantity } from "../utils/format";

const STORE_COVERAGE_ID = "22222222-2222-2222-2222-222222222222";
const FREE_DELIVERY_THRESHOLD = 5000;
const DELIVERY_FEE = 500;
const ONLINE_SHARE = 0.8;
const HOUSE_OPTIONS = [{ label: "д. 4", value: STORE_COVERAGE_ID }];

type AddressErrors = {
  entrance?: string;
  floor?: string;
  apartment?: string;
};

function validatePositiveInteger(value: string, label: string) {
  const number = Number(value);
  if (!value.trim()) return `${label} обязателен`;
  if (!Number.isInteger(number) || number <= 0) {
    return `${label} должен быть положительным целым числом`;
  }
  return undefined;
}

function readBackendAmount(...values: Array<string | number | undefined>) {
  for (const value of values) {
    if (value === undefined) continue;

    const amount = Number(value);
    if (Number.isFinite(amount)) return amount;
  }

  return undefined;
}

export function CheckoutPage() {
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const { modules } = useApi();
  const { showToast } = useToast();
  const { openPaywall } = usePaywall();
  const { items, subtotal, appliedPromo, clearCart } = useCart();
  const [entrance, setEntrance] = useState("");
  const [floor, setFloor] = useState("");
  const [apartment, setApartment] = useState("");
  const [entranceCode, setEntranceCode] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [errors, setErrors] = useState<AddressErrors>({});
  const [loadingLabel, setLoadingLabel] = useState<string | null>(null);

  const deliveryFee = subtotal < FREE_DELIVERY_THRESHOLD ? DELIVERY_FEE : 0;
  const promoDiscount = appliedPromo?.discount_amount ?? 0;
  const finalTotal = subtotal - promoDiscount + deliveryFee;
  const onlineAmount = Math.round(finalTotal * ONLINE_SHARE * 100) / 100;
  const posRemainder = Math.round((finalTotal - onlineAmount) * 100) / 100;
  const isLoading = loadingLabel !== null;

  if (!accessToken) {
    return <Navigate to="/login?returnTo=/checkout" replace />;
  }

  if (items.length === 0) {
    return (
      <PageContainer className="checkout-page">
        <H1>Оформление заказа</H1>
        <EmptyState
          title="Корзина пока пустая"
          description="Добавьте товары, чтобы перейти к оформлению."
          action={
            <Button type="button" onClick={() => navigate("/shop")}>
              Перейти в витрину
            </Button>
          }
        />
      </PageContainer>
    );
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = {
      entrance: validatePositiveInteger(entrance, "Подъезд"),
      floor: validatePositiveInteger(floor, "Этаж"),
      apartment: validatePositiveInteger(apartment, "Квартира"),
    };
    setErrors(nextErrors);

    const firstError = nextErrors.entrance ?? nextErrors.floor ?? nextErrors.apartment;
    if (firstError) {
      showToast({ message: firstError, tone: "warning" });
      return;
    }

    try {
      setLoadingLabel("Сохраняем адрес");
      const addressResponse = await modules.addressesApi.create({
        store_coverage_id: STORE_COVERAGE_ID,
        entrance: Number(entrance),
        floor: Number(floor),
        apartment: Number(apartment),
        entrance_code: entranceCode.trim() || undefined,
        is_default: isDefault,
      });

      setLoadingLabel("Создаём заказ");
      const orderResponse = await modules.ordersApi.create({
        payment_method: "online",
        delivery_address_id: addressResponse.address.id,
        items: items.map((item) => ({
          product_id: item.product_id,
          quantity: Number(item.cartQuantity),
        })),
        ...(appliedPromo ? { promo_code: appliedPromo.promo_code } : {}),
      });

      const preauthAmount = readBackendAmount(
        orderResponse.payment_options.online.preauth_amount,
        orderResponse.order.online_payment_amount,
      );
      const finalOrderTotal = readBackendAmount(
        orderResponse.breakdown.final_total,
        orderResponse.order.final_total,
      );
      const deliveryOrderFee = readBackendAmount(
        orderResponse.breakdown.delivery_fee,
        orderResponse.order.delivery_fee,
      );
      const discountOrderTotal = readBackendAmount(
        orderResponse.breakdown.discount_total,
        orderResponse.breakdown.promo_discount,
        orderResponse.order.discount_total,
      );
      const posRemainderAmount = readBackendAmount(
        orderResponse.payment_options.online.remainder_on_delivery,
        orderResponse.order.pos_terminal_topup,
      );

      if (preauthAmount === undefined) {
        throw new Error("Backend did not return online payment amount");
      }
      setLoadingLabel("Инициируем оплату");
      const paymentInit = await modules.paymentsApi.payOrderOnline(orderResponse.order_id);
      const widgetAmount = Number(paymentInit.payment.amount);
      setLoadingLabel("Открываем оплату");
      await paymentProvider.init(
        Number.isFinite(widgetAmount) ? widgetAmount : preauthAmount,
        orderResponse.order_id,
      );

      saveOrderResult({
        orderId: orderResponse.order_id,
        orderNumber: orderResponse.order_number ?? orderResponse.order_id,
        preauthAmount,
        finalTotal: finalOrderTotal,
        deliveryFee: deliveryOrderFee,
        discountTotal: discountOrderTotal,
        posRemainderAmount,
        fulfillmentWindow: orderResponse.order.fulfillment_window,
      });
      clearCart();
      navigate("/order-success", { replace: true });
    } catch (error) {
      if (error instanceof APIError && error.code?.startsWith("subscription_")) {
        openPaywall();
      } else if (!(error instanceof APIError)) {
        showToast({
          message: error instanceof Error ? error.message : "Не удалось завершить оформление",
          tone: "danger",
        });
      }
    } finally {
      setLoadingLabel(null);
    }
  };

  return (
    <PageContainer className="checkout-page">
      <header className="page-heading">
        <span className="page-kicker">Последний шаг</span>
        <H1>Оформление заказа</H1>
      </header>

      <form className="checkout-layout" onSubmit={handleSubmit} noValidate>
        <div className="checkout-main">
          <Card className="checkout-card">
            <H2>Адрес доставки</H2>
            <div className="checkout-address-grid">
              <Dropdown
                className="checkout-house-field"
                label="Дом"
                options={HOUSE_OPTIONS}
                defaultValue={STORE_COVERAGE_ID}
                disabled={isLoading}
              />
              <TextField
                label="Подъезд"
                type="number"
                inputMode="numeric"
                min="1"
                max="4"
                step="1"
                value={entrance}
                error={errors.entrance}
                disabled={isLoading}
                onChange={(event) => {
                  setEntrance(event.target.value);
                  setErrors((current) => ({ ...current, entrance: undefined }));
                }}
              />
              <TextField
                label="Этаж"
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                value={floor}
                error={errors.floor}
                disabled={isLoading}
                onChange={(event) => {
                  setFloor(event.target.value);
                  setErrors((current) => ({ ...current, floor: undefined }));
                }}
              />
              <TextField
                label="Квартира"
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                value={apartment}
                error={errors.apartment}
                disabled={isLoading}
                onChange={(event) => {
                  setApartment(event.target.value);
                  setErrors((current) => ({ ...current, apartment: undefined }));
                }}
              />
              <TextField
                label="Код домофона"
                autoComplete="off"
                value={entranceCode}
                disabled={isLoading}
                onChange={(event) => setEntranceCode(event.target.value)}
              />
            </div>
            <Checkbox
              checked={isDefault}
              disabled={isLoading}
              label="Сделать адресом по умолчанию"
              onChange={(event) => setIsDefault(event.target.checked)}
            />
          </Card>

          <Card className="checkout-card">
            <H2>Ваши товары</H2>
            <div className="checkout-products" aria-label="Товары заказа">
              {items.map((item) => (
                <article className="checkout-product" key={item.product_id}>
                  <ProductVisual category={item.category} compact />
                  <div>
                    <strong>{item.name}</strong>
                    <span>
                      {formatQuantity(item.cartQuantity)} {item.is_weighted ? "кг" : "шт"} ×{" "}
                      {formatCurrency(Number(item.price_per_unit))}
                    </span>
                  </div>
                  <strong>
                    {formatCurrency(Number(item.price_per_unit) * item.cartQuantity)}
                  </strong>
                </article>
              ))}
            </div>
          </Card>
        </div>

        <aside className="checkout-summary" aria-label="Оплата заказа">
          <Card className="summary-card checkout-summary-card">
            <H2>Оплата</H2>
            <dl className="price-list">
              <div>
                <dt>Товары</dt>
                <dd>{formatCurrency(subtotal)}</dd>
              </div>
              {appliedPromo ? (
                <div>
                  <dt>Промокод</dt>
                  <dd>-{formatCurrency(promoDiscount)}</dd>
                </div>
              ) : null}
              <div>
                <dt>Доставка</dt>
                <dd>{deliveryFee === 0 ? "Бесплатно" : formatCurrency(deliveryFee)}</dd>
              </div>
              <div className="price-list__total">
                <dt>Итого предварительно</dt>
                <dd>{formatCurrency(finalTotal)}</dd>
              </div>
            </dl>
            <Divider />
            <div className="split-payment">
              <span className="split-payment__title">ОПЛАТА В ДВЕ ЧАСТИ</span>
              <div>
                <span>Сейчас на сайте — 80% предварительно</span>
                <strong>{formatCurrency(onlineAmount, 2)}</strong>
              </div>
              <div>
                <span>Курьеру на ПОС-терминал, предварительно</span>
                <strong>~{formatCurrency(posRemainder, 2)}</strong>
              </div>
              <p>Итог станет окончательным после взвешивания</p>
            </div>
            <Button
              type="submit"
              size="lg"
              fullWidth
              disabled={isLoading}
              leftIcon={isLoading ? <Spinner /> : undefined}
            >
              {loadingLabel ?? `Предварительно оплатить ${formatCurrency(onlineAmount, 2)} (80%) картой`}
            </Button>
          </Card>
        </aside>
      </form>
    </PageContainer>
  );
}
