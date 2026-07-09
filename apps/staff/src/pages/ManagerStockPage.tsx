import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Badge,
  Body,
  Button,
  Card,
  H1,
  Icon,
  Loader,
  Modal,
  Spinner,
  Switch,
  Table,
  TextField,
} from "@koz/ui";
import { useApi, useToast } from "@koz/api";

type InventoryItem = {
  product_id: string | number;
  name?: string;
  unit?: string;
  effective_price?: string | number;
  selling_price?: string | number | null;
  quantity?: string | number;
  status?: string;
  is_visible?: boolean;
};

type InventoryDraft = {
  selling_price: string;
  quantity: string;
};

const statusTone = (status?: string) => {
  if (status === "out_of_stock") return "danger";
  if (status === "low_stock") return "warning";
  return "success";
};

const statusLabel = (status?: string) => {
  if (status === "out_of_stock") return "Нет остатка";
  if (status === "low_stock") return "Мало";
  if (status === "available") return "В наличии";
  return status ?? "—";
};

const formatCurrency = (value: string | number | undefined) =>
  `${Number(value ?? 0).toLocaleString("ru-RU", {
    maximumFractionDigits: 0,
  })} ₸`;

const draftFromItem = (item: InventoryItem): InventoryDraft => ({
  selling_price: item.selling_price === null || item.selling_price === undefined ? "" : String(item.selling_price),
  quantity: item.quantity === undefined ? "" : String(item.quantity),
});

export function ManagerStockPage() {
  const { modules } = useApi();
  const { showToast } = useToast();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, InventoryDraft>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [busyProductId, setBusyProductId] = useState<string | number | null>(null);
  const [incomingItem, setIncomingItem] = useState<InventoryItem | null>(null);
  const [incomingQuantity, setIncomingQuantity] = useState("");

  const loadInventory = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = (await modules.managerApi.getInventory()) as unknown as { inventory: InventoryItem[] };
      const nextInventory = result.inventory ?? [];
      setInventory(nextInventory);
      setDrafts(
        nextInventory.reduce<Record<string, InventoryDraft>>((accumulator, item) => {
          accumulator[String(item.product_id)] = draftFromItem(item);
          return accumulator;
        }, {}),
      );
    } finally {
      setIsLoading(false);
    }
  }, [modules.managerApi]);

  useEffect(() => {
    void loadInventory();
  }, [loadInventory]);

  const updateInventory = async (
    item: InventoryItem,
    payload: { is_visible?: boolean; selling_price?: number | null; quantity?: number },
  ) => {
    setBusyProductId(item.product_id);
    try {
      await modules.managerApi.updateInventory(item.product_id, payload);
      await loadInventory();
      showToast({ message: "Остаток обновлён.", tone: "success" });
    } finally {
      setBusyProductId(null);
    }
  };

  const saveSellingPrice = async (item: InventoryItem) => {
    const draft = drafts[String(item.product_id)]?.selling_price ?? "";
    const current = item.selling_price === null || item.selling_price === undefined ? "" : String(item.selling_price);

    if (draft === current) return;

    const sellingPrice = draft.trim() === "" ? null : Number(draft);
    if (sellingPrice !== null && (!Number.isFinite(sellingPrice) || sellingPrice < 0)) {
      showToast({ message: "Цена должна быть пустой или не меньше 0.", tone: "warning" });
      return;
    }

    await updateInventory(item, { selling_price: sellingPrice });
  };

  const saveQuantity = async (item: InventoryItem) => {
    const draft = drafts[String(item.product_id)]?.quantity ?? "";
    const current = item.quantity === undefined ? "" : String(item.quantity);

    if (draft === current) return;

    const quantity = Number(draft);
    if (!Number.isFinite(quantity) || quantity < 0) {
      showToast({ message: "Остаток должен быть не меньше 0.", tone: "warning" });
      return;
    }

    await updateInventory(item, { quantity });
  };

  const submitIncoming = async () => {
    if (!incomingItem) return;
    const quantity = Number(incomingQuantity);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      showToast({ message: "Приход должен быть больше 0.", tone: "warning" });
      return;
    }

    setBusyProductId(incomingItem.product_id);
    try {
      await modules.managerApi.receiveInventory(incomingItem.product_id, { quantity });
      setIncomingItem(null);
      setIncomingQuantity("");
      await loadInventory();
      showToast({ message: "Приход добавлен.", tone: "success" });
    } finally {
      setBusyProductId(null);
    }
  };

  const columns = useMemo(
    () => [
      {
        key: "name",
        header: "Товар",
        render: (item: InventoryItem) => <strong>{item.name}</strong>,
      },
      {
        key: "unit",
        header: "Unit",
        render: (item: InventoryItem) => item.unit ?? "—",
      },
      {
        key: "effective_price",
        header: "Effective price",
        render: (item: InventoryItem) => <strong className="manager-green">{formatCurrency(item.effective_price)}</strong>,
      },
      {
        key: "selling_price",
        header: "Selling price",
        render: (item: InventoryItem) => {
          const key = String(item.product_id);
          return (
            <TextField
              type="number"
              inputMode="decimal"
              min="0"
              placeholder="null"
              value={drafts[key]?.selling_price ?? ""}
              disabled={busyProductId === item.product_id}
              onChange={(event) =>
                setDrafts((current) => ({
                  ...current,
                  [key]: {
                    ...current[key],
                    selling_price: event.target.value,
                  },
                }))
              }
              onBlur={() => void saveSellingPrice(item)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
              }}
            />
          );
        },
      },
      {
        key: "quantity",
        header: "Quantity",
        render: (item: InventoryItem) => {
          const key = String(item.product_id);
          return (
            <TextField
              type="number"
              inputMode="decimal"
              min="0"
              value={drafts[key]?.quantity ?? ""}
              disabled={busyProductId === item.product_id}
              onChange={(event) =>
                setDrafts((current) => ({
                  ...current,
                  [key]: {
                    ...current[key],
                    quantity: event.target.value,
                  },
                }))
              }
              onBlur={() => void saveQuantity(item)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
              }}
            />
          );
        },
      },
      {
        key: "status",
        header: "Status",
        render: (item: InventoryItem) => <Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge>,
      },
      {
        key: "visible",
        header: "is_visible",
        render: (item: InventoryItem) => (
          <div className="manager-stop-cell">
            <Switch
              label="Стоп"
              checked={!item.is_visible}
              disabled={busyProductId === item.product_id}
              onChange={(event) => void updateInventory(item, { is_visible: !event.target.checked })}
            />
            <span>{item.is_visible ? "виден" : "скрыт"}</span>
          </div>
        ),
      },
      {
        key: "incoming",
        header: "Приход",
        render: (item: InventoryItem) => (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            leftIcon={busyProductId === item.product_id ? <Spinner /> : <Icon name="plus" size={16} />}
            disabled={busyProductId === item.product_id}
            onClick={() => {
              setIncomingItem(item);
              setIncomingQuantity("");
            }}
          >
            Приход
          </Button>
        ),
      },
    ],
    [busyProductId, drafts],
  );

  return (
    <section className="manager-screen">
      <div className="manager-heading">
        <H1>Остатки</H1>
        <Body tone="muted">Локальные цены, стоп-лист и приход товара</Body>
      </div>

      {isLoading ? (
        <Loader label="Загружаем остатки" />
      ) : (
        <Card className="manager-panel manager-panel--table">
          <Table
            columns={columns}
            data={inventory}
            getRowKey={(item) => String(item.product_id)}
            emptyText="Остатков нет"
          />
        </Card>
      )}

      <Modal
        open={Boolean(incomingItem)}
        title={incomingItem ? `Приход: ${incomingItem.name}` : undefined}
        onClose={() => setIncomingItem(null)}
        footer={
          <div className="manager-modal-actions">
            <Button type="button" variant="secondary" onClick={() => setIncomingItem(null)}>
              Закрыть
            </Button>
            <Button type="button" onClick={() => void submitIncoming()}>
              Оприходовать
            </Button>
          </div>
        }
      >
        <TextField
          label="quantity"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={incomingQuantity}
          onChange={(event) => setIncomingQuantity(event.target.value)}
        />
      </Modal>
    </section>
  );
}
