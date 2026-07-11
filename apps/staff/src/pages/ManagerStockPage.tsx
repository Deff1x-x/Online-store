import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Body,
  Button,
  Card,
  EmptyState,
  H1,
  Icon,
  Loader,
  Modal,
  Spinner,
  Switch,
  Table,
  TextField,
} from "@koz/ui";
import { formatMoney, useApi, useToast } from "@koz/api";

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

const draftFromItem = (item: InventoryItem): InventoryDraft => ({
  selling_price: item.selling_price === null || item.selling_price === undefined ? "" : String(item.selling_price),
  quantity: item.quantity === undefined ? "" : String(item.quantity),
});

const mergeInventoryItem = (current: InventoryItem[], updated: InventoryItem) =>
  current.map((item) => (String(item.product_id) === String(updated.product_id) ? { ...item, ...updated } : item));

export function ManagerStockPage() {
  const { modules } = useApi();
  const { showToast } = useToast();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, InventoryDraft>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busyProductId, setBusyProductId] = useState<string | number | null>(null);
  const [incomingItem, setIncomingItem] = useState<InventoryItem | null>(null);
  const [incomingQuantity, setIncomingQuantity] = useState("");
  const isMountedRef = useRef(false);
  const inventoryRequestIdRef = useRef(0);
  const backgroundRequestIdRef = useRef(0);
  const hasLoadedRef = useRef(false);
  const actionInFlightRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      inventoryRequestIdRef.current += 1;
      backgroundRequestIdRef.current = 0;
    };
  }, []);

  const loadInventory = useCallback(async ({ background = false, force = false }: { background?: boolean; force?: boolean } = {}) => {
    if (background && backgroundRequestIdRef.current !== 0 && !force) return;

    const requestId = ++inventoryRequestIdRef.current;
    const showInitialLoader = !hasLoadedRef.current;
    if (background) backgroundRequestIdRef.current = requestId;
    if (showInitialLoader) setIsLoading(true);
    if (!background) setLoadError(false);

    try {
      const result = await modules.managerApi.getInventory();
      const nextInventory = result.inventory;
      if (isMountedRef.current && requestId === inventoryRequestIdRef.current) {
        setInventory(nextInventory);
        setDrafts(
          nextInventory.reduce<Record<string, InventoryDraft>>((accumulator, item) => {
            accumulator[String(item.product_id)] = draftFromItem(item);
            return accumulator;
          }, {}),
        );
        setLoadError(false);
        hasLoadedRef.current = true;
      }
    } catch {
      if (isMountedRef.current && requestId === inventoryRequestIdRef.current) {
        setLoadError(true);
      }
    } finally {
      if (background && backgroundRequestIdRef.current === requestId) {
        backgroundRequestIdRef.current = 0;
      }
      if (isMountedRef.current && requestId === inventoryRequestIdRef.current && showInitialLoader) {
        setIsLoading(false);
      }
    }
  }, [modules.managerApi]);

  useEffect(() => {
    void loadInventory();
    return () => {
      inventoryRequestIdRef.current += 1;
      backgroundRequestIdRef.current = 0;
    };
  }, [loadInventory]);

  const updateInventory = useCallback(async (
    item: InventoryItem,
    payload: { is_visible?: boolean; selling_price?: number | null; quantity?: number },
  ) => {
    if (actionInFlightRef.current) return false;

    actionInFlightRef.current = true;
    if (isMountedRef.current) setBusyProductId(item.product_id);
    inventoryRequestIdRef.current += 1;
    try {
      const result = await modules.managerApi.updateInventory(item.product_id, payload);
      if (isMountedRef.current) {
        setInventory((current) => mergeInventoryItem(current, result.inventory));
        setDrafts((current) => ({
          ...current,
          [String(result.inventory.product_id)]: draftFromItem(result.inventory),
        }));
      }
      await loadInventory({ background: true, force: true });
      if (!isMountedRef.current) return true;
      showToast({ message: "Остаток обновлён.", tone: "success" });
      return true;
    } catch {
      return false;
    } finally {
      actionInFlightRef.current = false;
      if (isMountedRef.current) setBusyProductId(null);
    }
  }, [loadInventory, modules.managerApi, showToast]);

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

  const submitIncoming = useCallback(async () => {
    if (!incomingItem || actionInFlightRef.current) return;
    const quantity = Number(incomingQuantity);

    if (!Number.isFinite(quantity) || quantity <= 0) {
      showToast({ message: "Приход должен быть больше 0.", tone: "warning" });
      return;
    }

    actionInFlightRef.current = true;
    if (isMountedRef.current) setBusyProductId(incomingItem.product_id);
    inventoryRequestIdRef.current += 1;
    try {
      const result = await modules.managerApi.receiveInventory(incomingItem.product_id, { quantity });
      if (isMountedRef.current) {
        setInventory((current) => mergeInventoryItem(current, result.inventory));
        setDrafts((current) => ({
          ...current,
          [String(result.inventory.product_id)]: draftFromItem(result.inventory),
        }));
      }
      await loadInventory({ background: true, force: true });
      if (!isMountedRef.current) return;
      setIncomingItem(null);
      setIncomingQuantity("");
      showToast({ message: "Приход добавлен.", tone: "success" });
    } catch {
      // ApiErrorBridge already exposes the request error without closing the modal.
    } finally {
      actionInFlightRef.current = false;
      if (isMountedRef.current) setBusyProductId(null);
    }
  }, [incomingItem, incomingQuantity, loadInventory, modules.managerApi, showToast]);

  const columns = useMemo(
    () => [
      {
        key: "name",
        header: "Товар",
        render: (item: InventoryItem) => <strong>{item.name}</strong>,
      },
      {
        key: "unit",
        header: "Ед.",
        render: (item: InventoryItem) => item.unit ?? "—",
      },
      {
        key: "effective_price",
        header: "Эффективная цена",
        render: (item: InventoryItem) => <strong className="manager-green">{formatMoney(item.effective_price)}</strong>,
      },
      {
        key: "selling_price",
        header: "Локальная цена",
        render: (item: InventoryItem) => {
          const key = String(item.product_id);
          return (
            <TextField
              type="number"
              inputMode="decimal"
              min="0"
              placeholder="цена сети"
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
        header: "Остаток",
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
        header: "Статус",
        render: (item: InventoryItem) => <Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge>,
      },
      {
        key: "visible",
        header: "Видимость",
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
      ) : loadError && inventory.length === 0 ? (
        <EmptyState
          title="Не удалось загрузить остатки"
          description="Повторите попытку."
          action={<Button type="button" onClick={() => void loadInventory({ force: true })}>Повторить</Button>}
        />
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
        onClose={() => {
          if (incomingItem && busyProductId === incomingItem.product_id) return;
          setIncomingItem(null);
        }}
        footer={
          <div className="manager-modal-actions">
            <Button
              type="button"
              variant="secondary"
              disabled={Boolean(incomingItem && busyProductId === incomingItem.product_id)}
              onClick={() => setIncomingItem(null)}
            >
              Закрыть
            </Button>
            <Button
              type="button"
              disabled={Boolean(incomingItem && busyProductId === incomingItem.product_id)}
              leftIcon={incomingItem && busyProductId === incomingItem.product_id ? <Spinner /> : undefined}
              onClick={() => void submitIncoming()}
            >
              Оприходовать
            </Button>
          </div>
        }
      >
        <TextField
          label="Количество"
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
