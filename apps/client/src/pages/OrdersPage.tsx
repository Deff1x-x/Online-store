import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  H1,
  Icon,
  Loader,
  PageContainer,
} from "@koz/ui";
import { useApi, useAuth, type CustomerOrder, type DeliveryStatus, type OrderItem, type OrderPaymentStatus } from "@koz/api";
import { formatCurrency, formatQuantity } from "../utils/format";

type PaymentStatus = OrderPaymentStatus;
type OrderSummary = Pick<CustomerOrder, "id" | "order_number" | "final_total" | "delivery_status" | "payment_status" | "created_at">;
type OrderDetails = CustomerOrder & { items: OrderItem[] };

const STATUS_FLOW: Array<{ status: DeliveryStatus; label: string }> = [
  { status: "new", label: "Оформлен" },
  { status: "picked", label: "Собран" },
  { status: "in_delivery", label: "В пути" },
  { status: "delivered", label: "Доставлен" },
];

const STATUS_LABELS: Record<DeliveryStatus, string> = {
  new: "Оформлен",
  picked: "Собран",
  in_delivery: "В пути",
  delivered: "Доставлен",
  cancelled: "Отменён",
  failed: "Не доставлен",
};

const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  pending: "80% заблокировано, доплата по факту веса",
  online_paid: "80% оплачено/заблокировано, доплата по факту веса",
  fully_paid: "Оплачен полностью — сделка закрыта по ПОС",
  cancelled: "Оплата отменена",
};

function formatOrderDate(value: string) {
  return new Date(value).toLocaleString("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStatusTone(status: DeliveryStatus) {
  if (status === "delivered") return "success" as const;
  if (status === "cancelled" || status === "failed") return "danger" as const;
  return "primary" as const;
}

export function OrdersPage() {
  const navigate = useNavigate();
  const { accessToken } = useAuth();
  const { modules } = useApi();
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [detailsById, setDetailsById] = useState<Record<string, OrderDetails>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loadingDetailsId, setLoadingDetailsId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(accessToken));

  useEffect(() => {
    if (!accessToken) return;
    let active = true;

    modules.ordersApi
      .listMy()
      .then((response) => {
        if (active) setOrders(response.orders ?? []);
      })
      .catch(() => {
        // API errors are displayed by the shared ToastContext bridge.
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [accessToken, modules.ordersApi]);

  if (!accessToken) {
    return <Navigate to="/login?returnTo=/orders" replace />;
  }

  const toggleDetails = async (orderId: string) => {
    if (expandedId === orderId) {
      setExpandedId(null);
      return;
    }

    setExpandedId(orderId);
    if (detailsById[orderId]) return;

    setLoadingDetailsId(orderId);
    try {
      const response = await modules.ordersApi.getMy(orderId);
      setDetailsById((current) => ({ ...current, [orderId]: response.order }));
    } catch {
      setExpandedId(null);
    } finally {
      setLoadingDetailsId(null);
    }
  };

  return (
    <PageContainer className="orders-page">
      <header className="page-heading">
        <span className="page-kicker">История покупок</span>
        <H1>Мои заказы</H1>
      </header>

      {isLoading ? (
        <Loader label="Загружаем заказы" />
      ) : orders.length === 0 ? (
        <EmptyState
          title="У вас пока нет заказов"
          description="Соберите первый заказ из товаров по клубным ценам."
          action={
            <Button type="button" onClick={() => navigate("/shop")}>
              Перейти в витрину
            </Button>
          }
        />
      ) : (
        <div className="orders-list">
          {orders.map((order) => {
            const isExpanded = expandedId === order.id;
            const details = detailsById[order.id];
            const currentStep = STATUS_FLOW.findIndex(
              (step) => step.status === order.delivery_status,
            );
            const isTerminalError =
              order.delivery_status === "cancelled" || order.delivery_status === "failed";

            return (
              <Card className="order-card" key={order.id}>
                <div className="order-card__header">
                  <div>
                    <span>{formatOrderDate(order.created_at)}</span>
                    <strong>№ {order.order_number}</strong>
                  </div>
                  <Badge tone={getStatusTone(order.delivery_status)}>
                    {STATUS_LABELS[order.delivery_status]}
                  </Badge>
                </div>

                {isTerminalError ? (
                  <div className="order-status-terminal">
                    {STATUS_LABELS[order.delivery_status]}
                  </div>
                ) : (
                  <ol className="order-status-line" aria-label="Статус заказа">
                    {STATUS_FLOW.map((step, index) => (
                      <li
                        className={index <= currentStep ? "is-reached" : undefined}
                        aria-current={index === currentStep ? "step" : undefined}
                        key={step.status}
                      >
                        <span aria-hidden="true" />
                        {step.label}
                      </li>
                    ))}
                  </ol>
                )}

                <div className="order-card__summary">
                  <div>
                    <span>{PAYMENT_LABELS[order.payment_status]}</span>
                    <strong>{formatCurrency(Number(order.final_total), 2)}</strong>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    rightIcon={
                      <Icon
                        name={isExpanded ? "chevronDown" : "chevronRight"}
                        size={18}
                      />
                    }
                    aria-expanded={isExpanded}
                    onClick={() => toggleDetails(order.id)}
                  >
                    {isExpanded ? "Скрыть детали" : "Подробнее"}
                  </Button>
                </div>

                {isExpanded ? (
                  <div className="order-details">
                    {loadingDetailsId === order.id ? (
                      <Loader label="Загружаем детали" />
                    ) : details ? (
                      <>
                        <div className="order-details__items">
                          {details.items.map((item) => (
                            <div className="order-details__item" key={item.product_id}>
                              <div>
                                <strong>{item.name}</strong>
                                <span>
                                  {formatQuantity(Number(item.quantity))} ×{" "}
                                  {formatCurrency(Number(item.price_per_unit), 2)}
                                </span>
                              </div>
                              <strong>{formatCurrency(Number(item.line_total), 2)}</strong>
                            </div>
                          ))}
                        </div>
                        <dl className="order-details__totals">
                          <div>
                            <dt>Доставка</dt>
                            <dd>{formatCurrency(Number(details.delivery_fee), 2)}</dd>
                          </div>
                          <div>
                            <dt>Онлайн, 80%</dt>
                            <dd>{formatCurrency(Number(details.online_payment_amount), 2)}</dd>
                          </div>
                          <div>
                            <dt>Доплата по ПОС</dt>
                            <dd>{formatCurrency(Number(details.pos_terminal_topup), 2)}</dd>
                          </div>
                          <div className="order-details__total">
                            <dt>Итого</dt>
                            <dd>{formatCurrency(Number(details.final_total), 2)}</dd>
                          </div>
                        </dl>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
