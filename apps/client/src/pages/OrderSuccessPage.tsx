import { useNavigate } from "react-router-dom";
import { Button, Card, EmptyState, H1, Icon, PageContainer } from "@koz/ui";
import { readOrderResult } from "../orders/order-result";
import { formatCurrency } from "../utils/format";

export function OrderSuccessPage() {
  const navigate = useNavigate();
  const orderResult = readOrderResult();

  if (!orderResult) {
    return (
      <PageContainer className="order-success-page">
        <H1>Заказ не найден</H1>
        <EmptyState
          title="Нет данных о новом заказе"
          description="Вернитесь в витрину, чтобы собрать корзину."
          action={
            <Button type="button" onClick={() => navigate("/shop")}>
              Перейти в витрину
            </Button>
          }
        />
      </PageContainer>
    );
  }

  const deliveryMessage =
    orderResult.fulfillmentWindow === "next_morning"
      ? "Привезём завтра с 11:00"
      : "Привезём за 15–20 минут";

  return (
    <PageContainer className="order-success-page">
      <Card className="order-success-card" elevated>
        <span className="order-success-card__icon" aria-hidden="true">
          <Icon name="check" size={40} />
        </span>
        <span className="page-kicker">Заказ оформлен</span>
        <H1>Спасибо за заказ!</H1>
        <p className="order-success-card__number">Номер заказа: {orderResult.orderNumber}</p>
        <div className="order-success-card__payment">
          <span>Заблокировано на карте (80%)</span>
          <strong>{formatCurrency(orderResult.preauthAmount, 2)}</strong>
          {orderResult.finalTotal !== undefined ? (
            <span>Итого по заказу: {formatCurrency(orderResult.finalTotal, 2)}</span>
          ) : null}
          {orderResult.posRemainderAmount !== undefined ? (
            <span>
              Курьеру на POS-терминал: ~{formatCurrency(orderResult.posRemainderAmount, 2)}
            </span>
          ) : null}
        </div>
        <p className="order-success-card__delivery">
          <Icon name="truck" size={24} />
          <strong>{deliveryMessage}</strong>
        </p>
        <div className="order-success-card__actions">
          <Button type="button" size="lg" onClick={() => navigate("/orders")}>
            Мои заказы
          </Button>
          <Button
            type="button"
            size="lg"
            variant="secondary"
            onClick={() => navigate("/shop")}
          >
            Вернуться в витрину
          </Button>
        </div>
      </Card>
    </PageContainer>
  );
}
