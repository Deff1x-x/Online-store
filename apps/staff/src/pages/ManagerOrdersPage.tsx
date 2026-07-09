import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Badge,
  Body,
  Button,
  Card,
  Checkbox,
  Dropdown,
  H1,
  Icon,
  Loader,
  Modal,
  Spinner,
  Table,
  TextField,
} from "@koz/ui";
import { useApi, useToast } from "@koz/api";

type OrderStatus = "new" | "picked" | "in_delivery" | "delivered" | "failed" | "cancelled";

type OrderItem = {
  product_id?: string | number;
  name?: string;
  quantity?: string | number;
  unit?: string;
  line_total?: string | number;
};

type DeliveryAddress = {
  coverage_address?: string;
  entrance?: string;
  floor?: string;
  apartment?: string;
  entrance_code?: string;
};

type ManagerOrder = {
  id: string | number;
  delivery_status: OrderStatus;
  delivery_address?: DeliveryAddress | null;
  items?: OrderItem[];
  total_price?: string | number;
  final_total?: string | number;
  online_payment_amount?: string | number;
  online_capture_amount?: string | number;
  pos_terminal_topup?: string | number;
  actual_weight?: string | number | null;
  created_at?: string;
};

type ConfirmAction = {
  title: string;
  description: string;
  confirmLabel: string;
  variant?: "primary" | "danger";
  run: () => Promise<void>;
};

const statusOptions = [
  { label: "Все статусы", value: "" },
  { label: "Новые", value: "new" },
  { label: "Собраны", value: "picked" },
  { label: "В пути", value: "in_delivery" },
  { label: "Доставлены", value: "delivered" },
  { label: "Не открыл дверь", value: "failed" },
  { label: "Отменены", value: "cancelled" },
];

const statusLabels: Record<OrderStatus, string> = {
  new: "Новый",
  picked: "Собран",
  in_delivery: "В пути",
  delivered: "Доставлен",
  failed: "Не открыл дверь",
  cancelled: "Отменён",
};

const terminalStatuses = new Set<OrderStatus>(["delivered", "failed", "cancelled"]);

const formatCurrency = (value: string | number | undefined) =>
  `${Number(value ?? 0).toLocaleString("ru-RU", {
    maximumFractionDigits: 0,
  })} ₸`;

function addressLine(address?: DeliveryAddress | null) {
  if (!address) return "Адрес не указан";
  return [
    address.coverage_address,
    address.entrance ? `п.${address.entrance}` : null,
    address.floor ? `эт.${address.floor}` : null,
    address.apartment ? `кв.${address.apartment}` : null,
    address.entrance_code ? `код ${address.entrance_code}` : null,
  ]
    .filter(Boolean)
    .join(", ");
}

function mergeOrder(current: ManagerOrder[], updated: ManagerOrder) {
  return current.map((order) =>
    String(order.id) === String(updated.id)
      ? {
          ...order,
          ...updated,
          items: updated.items ?? order.items,
          delivery_address: updated.delivery_address ?? order.delivery_address,
        }
      : order,
  );
}

export function ManagerOrdersPage() {
  const { modules } = useApi();
  const { showToast } = useToast();
  const [orders, setOrders] = useState<ManagerOrder[]>([]);
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [busyOrderId, setBusyOrderId] = useState<string | number | null>(null);
  const [actualWeightOrder, setActualWeightOrder] = useState<ManagerOrder | null>(null);
  const [actualWeight, setActualWeight] = useState("");
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [posConfirmed, setPosConfirmed] = useState<Record<string, boolean>>({});

  const loadOrders = useCallback(
    async (silent = false) => {
      if (!silent) setIsLoading(true);
      try {
        const result = (await modules.managerApi.getOrders(status ? { status } : undefined)) as unknown as {
          orders: ManagerOrder[];
        };
        setOrders(result.orders ?? []);
      } finally {
        if (!silent) setIsLoading(false);
      }
    },
    [modules.managerApi, status],
  );

  useEffect(() => {
    void loadOrders();
    const interval = window.setInterval(() => void loadOrders(true), 30000);
    return () => window.clearInterval(interval);
  }, [loadOrders]);

  const updateStatus = async (order: ManagerOrder, nextStatus: OrderStatus) => {
    setBusyOrderId(order.id);
    try {
      const result = (await modules.managerApi.updateOrderStatus(order.id, {
        delivery_status: nextStatus,
      })) as unknown as { order: ManagerOrder };
      setOrders((current) => mergeOrder(current, result.order));
      await loadOrders(true);
      showToast({ message: "Статус заказа обновлён.", tone: "success" });
    } finally {
      setBusyOrderId(null);
    }
  };

  const pickOrder = async (order: ManagerOrder) => {
    setBusyOrderId(order.id);
    try {
      const result = (await modules.managerApi.pickOrder(order.id)) as unknown as { order: ManagerOrder };
      setOrders((current) => mergeOrder(current, result.order));
      showToast({ message: "Заказ переведён в сборку.", tone: "success" });
    } finally {
      setBusyOrderId(null);
    }
  };

  const submitActualWeight = async () => {
    if (!actualWeightOrder) return;
    const numericWeight = Number(actualWeight);

    if (!Number.isFinite(numericWeight) || numericWeight <= 0) {
      showToast({ message: "Фактический вес должен быть больше 0.", tone: "warning" });
      return;
    }

    setBusyOrderId(actualWeightOrder.id);
    try {
      const result = (await modules.managerApi.recordActualWeight(actualWeightOrder.id, {
        actual_weight: numericWeight,
      })) as unknown as { order: ManagerOrder };
      setOrders((current) => mergeOrder(current, result.order));
      setActualWeightOrder(null);
      setActualWeight("");
      showToast({
        title: "Вес пересчитан",
        message: `Итого ${formatCurrency(result.order.final_total)}, capture ${formatCurrency(
          result.order.online_capture_amount,
        )}, POS ${formatCurrency(result.order.pos_terminal_topup)}.`,
        tone: "success",
      });
    } finally {
      setBusyOrderId(null);
    }
  };

  const columns = useMemo(
    () => [
      {
        key: "number",
        header: "Номер",
        render: (order: ManagerOrder) => <strong className="manager-order-number">#{order.id}</strong>,
      },
      {
        key: "status",
        header: "Статус",
        render: (order: ManagerOrder) => (
          <Badge tone={terminalStatuses.has(order.delivery_status) ? "neutral" : "primary"}>
            {statusLabels[order.delivery_status] ?? order.delivery_status}
          </Badge>
        ),
      },
      {
        key: "address",
        header: "Адрес",
        render: (order: ManagerOrder) => <span className="manager-address">{addressLine(order.delivery_address)}</span>,
      },
      {
        key: "items",
        header: "Позиции",
        render: (order: ManagerOrder) => (
          <div className="manager-items-list">
            {(order.items ?? []).map((item) => (
              <span key={`${order.id}-${item.product_id ?? item.name}`}>
                {item.name} · {item.quantity}
              </span>
            ))}
          </div>
        ),
      },
      {
        key: "money",
        header: "Суммы",
        render: (order: ManagerOrder) => (
          <dl className="manager-money-list">
            <div>
              <dt>Сумма</dt>
              <dd>{formatCurrency(order.final_total ?? order.total_price)}</dd>
            </div>
            <div>
              <dt>Hold 80%</dt>
              <dd>{formatCurrency(order.online_payment_amount)}</dd>
            </div>
            <div>
              <dt>POS topup</dt>
              <dd>{formatCurrency(order.pos_terminal_topup)}</dd>
            </div>
            {order.online_capture_amount !== undefined ? (
              <div>
                <dt>Capture</dt>
                <dd>{formatCurrency(order.online_capture_amount)}</dd>
              </div>
            ) : null}
          </dl>
        ),
      },
      {
        key: "actions",
        header: "Действия",
        render: (order: ManagerOrder) => {
          const isBusy = busyOrderId === order.id;
          const orderKey = String(order.id);

          if (order.delivery_status === "new") {
            return (
              <div className="manager-actions">
                <Button
                  type="button"
                  size="sm"
                  disabled={isBusy}
                  leftIcon={isBusy ? <Spinner /> : <Icon name="package" size={16} />}
                  onClick={() => void pickOrder(order)}
                >
                  Собрать
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="danger"
                  disabled={isBusy}
                  leftIcon={<Icon name="close" size={16} />}
                  onClick={() =>
                    setConfirmAction({
                      title: "Отменить заказ",
                      description: `Заказ #${order.id} будет отменён, остаток вернётся после обновления.`,
                      confirmLabel: "Отменить",
                      variant: "danger",
                      run: () => updateStatus(order, "cancelled"),
                    })
                  }
                >
                  Отменить
                </Button>
              </div>
            );
          }

          if (order.delivery_status === "picked") {
            return (
              <div className="manager-actions">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={isBusy}
                  onClick={() => {
                    setActualWeightOrder(order);
                    setActualWeight(order.actual_weight ? String(order.actual_weight) : "");
                  }}
                >
                  Фактический вес
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={isBusy}
                  leftIcon={<Icon name="truck" size={16} />}
                  onClick={() => void updateStatus(order, "in_delivery")}
                >
                  В пути
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="danger"
                  disabled={isBusy}
                  leftIcon={<Icon name="close" size={16} />}
                  onClick={() =>
                    setConfirmAction({
                      title: "Отменить заказ",
                      description: `Заказ #${order.id} будет отменён, остаток вернётся после обновления.`,
                      confirmLabel: "Отменить",
                      variant: "danger",
                      run: () => updateStatus(order, "cancelled"),
                    })
                  }
                >
                  Отменить
                </Button>
              </div>
            );
          }

          if (order.delivery_status === "in_delivery") {
            return (
              <div className="manager-actions manager-actions--delivery">
                <Checkbox
                  label="оплата на POS принята"
                  checked={Boolean(posConfirmed[orderKey])}
                  onChange={(event) =>
                    setPosConfirmed((current) => ({
                      ...current,
                      [orderKey]: event.target.checked,
                    }))
                  }
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={isBusy || !posConfirmed[orderKey]}
                  leftIcon={<Icon name="check" size={16} />}
                  onClick={() => {
                    if (!posConfirmed[orderKey]) {
                      showToast({ message: "Подтвердите оплату POS перед доставкой.", tone: "warning" });
                      return;
                    }
                    setConfirmAction({
                      title: "Доставить заказ",
                      description: `Подтвердить доставку #${order.id} и получение оплаты POS?`,
                      confirmLabel: "Доставлен",
                      run: () => updateStatus(order, "delivered"),
                    });
                  }}
                >
                  Доставлен · оплата POS получена
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="danger"
                  disabled={isBusy}
                  leftIcon={<Icon name="close" size={16} />}
                  onClick={() =>
                    setConfirmAction({
                      title: "Не открыл дверь",
                      description: `Заказ #${order.id} будет отмечен как failed, остаток вернётся после обновления.`,
                      confirmLabel: "Не открыл дверь",
                      variant: "danger",
                      run: () => updateStatus(order, "failed"),
                    })
                  }
                >
                  Не открыл дверь
                </Button>
              </div>
            );
          }

          return <Body tone="muted">Действий нет</Body>;
        },
      },
    ],
    [busyOrderId, posConfirmed, showToast],
  );

  return (
    <section className="manager-screen">
      <div className="manager-heading manager-heading--row">
        <div>
          <H1>Заказы</H1>
          <Body tone="muted">Автообновление каждые 30 секунд</Body>
        </div>
        <Dropdown
          label="Статус"
          value={status}
          options={statusOptions}
          onChange={(event) => setStatus(event.target.value)}
        />
      </div>

      {isLoading ? (
        <Loader label="Загружаем заказы" />
      ) : (
        <Card className="manager-panel manager-panel--table">
          <Table columns={columns} data={orders} getRowKey={(order) => String(order.id)} emptyText="Заказов нет" />
        </Card>
      )}

      <Modal
        open={Boolean(actualWeightOrder)}
        title={actualWeightOrder ? `Фактический вес #${actualWeightOrder.id}` : undefined}
        onClose={() => setActualWeightOrder(null)}
        footer={
          <div className="manager-modal-actions">
            <Button type="button" variant="secondary" onClick={() => setActualWeightOrder(null)}>
              Закрыть
            </Button>
            <Button
              type="button"
              disabled={Boolean(actualWeightOrder && busyOrderId === actualWeightOrder.id)}
              onClick={() => void submitActualWeight()}
            >
              Сохранить
            </Button>
          </div>
        }
      >
        <TextField
          label="actual_weight"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={actualWeight}
          onChange={(event) => setActualWeight(event.target.value)}
        />
      </Modal>

      <Modal
        open={Boolean(confirmAction)}
        title={confirmAction?.title}
        onClose={() => setConfirmAction(null)}
        footer={
          <div className="manager-modal-actions">
            <Button type="button" variant="secondary" onClick={() => setConfirmAction(null)}>
              Назад
            </Button>
            <Button
              type="button"
              variant={confirmAction?.variant === "danger" ? "danger" : "primary"}
              onClick={async () => {
                const action = confirmAction;
                setConfirmAction(null);
                await action?.run();
              }}
            >
              {confirmAction?.confirmLabel}
            </Button>
          </div>
        }
      >
        <Body tone="muted">{confirmAction?.description}</Body>
      </Modal>
    </section>
  );
}
