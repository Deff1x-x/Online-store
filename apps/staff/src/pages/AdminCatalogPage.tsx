import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Body,
  Button,
  Card,
  EmptyState,
  H1,
  Loader,
  Modal,
  Spinner,
  Table,
  TextField,
} from "@koz/ui";
import { formatMoney, useApi, useToast, type AdminDeliverySettings, type AdminStore } from "@koz/api";

type StoreDraft = {
  name: string;
  address: string;
};

type CoverageDraft = {
  address: string;
  entrance_count: string;
};

type DeliverySettingsDraft = {
  min_order_value_for_free_delivery: string;
  delivery_fee: string;
  ordering_open_hour: string;
  ordering_close_hour: string;
};

const emptyStoreDraft: StoreDraft = { name: "", address: "" };
const emptyCoverageDraft: CoverageDraft = { address: "", entrance_count: "" };

const deliverySettingsDraft = (settings?: AdminDeliverySettings | null): DeliverySettingsDraft => ({
  min_order_value_for_free_delivery: settings?.min_order_value_for_free_delivery === undefined
    ? ""
    : String(settings.min_order_value_for_free_delivery),
  delivery_fee: settings?.delivery_fee === undefined ? "" : String(settings.delivery_fee),
  ordering_open_hour: settings?.ordering_open_hour === undefined ? "" : String(settings.ordering_open_hour),
  ordering_close_hour: settings?.ordering_close_hour === undefined ? "" : String(settings.ordering_close_hour),
});

const deliverySettingsLabel = (settings?: AdminDeliverySettings | null) => {
  if (!settings) return "—";

  return (
    <div className="admin-delivery-settings">
      <span>Порог: {formatMoney(settings.min_order_value_for_free_delivery)}</span>
      <span>Стоимость: {formatMoney(settings.delivery_fee)}</span>
      <span>
        Окно: {settings.ordering_open_hour}:00–{settings.ordering_close_hour}:00
      </span>
    </div>
  );
};

export default function AdminCatalogPage() {
  const { modules } = useApi();
  const { showToast } = useToast();
  const [stores, setStores] = useState<AdminStore[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [storeDraft, setStoreDraft] = useState<StoreDraft>(emptyStoreDraft);
  const [coverageStore, setCoverageStore] = useState<AdminStore | null>(null);
  const [coverageDraft, setCoverageDraft] = useState<CoverageDraft>(emptyCoverageDraft);
  const [settingsStore, setSettingsStore] = useState<AdminStore | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<DeliverySettingsDraft>(deliverySettingsDraft());
  const [busyAction, setBusyAction] = useState<"create" | "coverage" | "settings" | null>(null);

  const loadStores = useCallback(async () => {
    setIsLoading(true);
    setLoadError(false);

    try {
      const response = await modules.adminCatalogApi.getStores();
      setStores(response.stores);
    } catch {
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, [modules.adminCatalogApi]);

  useEffect(() => {
    void loadStores();
  }, [loadStores]);

  const closeCreate = () => {
    setIsCreating(false);
    setStoreDraft(emptyStoreDraft);
  };

  const submitStore = async () => {
    const name = storeDraft.name.trim();
    const address = storeDraft.address.trim();

    if (!name || !address) {
      showToast({ message: "Укажите название и адрес точки.", tone: "warning" });
      return;
    }

    setBusyAction("create");
    try {
      await modules.adminCatalogApi.createStore({ name, address });
      closeCreate();
      await loadStores();
      showToast({ message: "Точка создана.", tone: "success" });
    } finally {
      setBusyAction(null);
    }
  };

  const openCoverage = (store: AdminStore) => {
    setCoverageStore(store);
    setCoverageDraft(emptyCoverageDraft);
  };

  const closeCoverage = () => {
    setCoverageStore(null);
    setCoverageDraft(emptyCoverageDraft);
  };

  const submitCoverage = async () => {
    if (!coverageStore) return;

    const address = coverageDraft.address.trim();
    const entranceCount = Number(coverageDraft.entrance_count);

    if (!address) {
      showToast({ message: "Укажите адрес дома.", tone: "warning" });
      return;
    }

    if (!Number.isInteger(entranceCount) || entranceCount < 0) {
      showToast({ message: "Количество подъездов должно быть целым неотрицательным числом.", tone: "warning" });
      return;
    }

    setBusyAction("coverage");
    try {
      await modules.adminCatalogApi.upsertCoverage({
        store_id: coverageStore.id,
        address,
        entrance_count: entranceCount,
      });
      closeCoverage();
      await loadStores();
      showToast({ message: "Дом привязан к точке.", tone: "success" });
    } finally {
      setBusyAction(null);
    }
  };

  const openSettings = (store: AdminStore) => {
    setSettingsStore(store);
    setSettingsDraft(deliverySettingsDraft(store.delivery_settings));
  };

  const closeSettings = () => {
    setSettingsStore(null);
    setSettingsDraft(deliverySettingsDraft());
  };

  const submitSettings = async () => {
    if (!settingsStore) return;

    const values = [
      settingsDraft.min_order_value_for_free_delivery,
      settingsDraft.delivery_fee,
      settingsDraft.ordering_open_hour,
      settingsDraft.ordering_close_hour,
    ];

    if (values.some((value) => value.trim() === "") || !values.map(Number).every(Number.isFinite)) {
      showToast({ message: "Заполните настройки доставки числовыми значениями.", tone: "warning" });
      return;
    }

    const [minOrderValueForFreeDelivery, deliveryFee, orderingOpenHour, orderingCloseHour] = values.map(Number);

    setBusyAction("settings");
    try {
      await modules.adminCatalogApi.upsertDeliverySettings(settingsStore.id, {
        min_order_value_for_free_delivery: minOrderValueForFreeDelivery,
        delivery_fee: deliveryFee,
        ordering_open_hour: orderingOpenHour,
        ordering_close_hour: orderingCloseHour,
      });
      closeSettings();
      await loadStores();
      showToast({ message: "Настройки доставки сохранены.", tone: "success" });
    } finally {
      setBusyAction(null);
    }
  };

  const columns = useMemo(
    () => [
      {
        key: "store",
        header: "Точка",
        render: (store: AdminStore) => <strong>{store.name}</strong>,
      },
      {
        key: "address",
        header: "Адрес",
        render: (store: AdminStore) => store.address,
      },
      {
        key: "subscribers",
        header: "Подписчики",
        render: (store: AdminStore) => store.subscribers_count,
      },
      {
        key: "coverage",
        header: "Дома",
        render: (store: AdminStore) => store.coverage_count,
      },
      {
        key: "delivery_settings",
        header: "Настройки доставки",
        render: (store: AdminStore) => deliverySettingsLabel(store.delivery_settings),
      },
      {
        key: "actions",
        header: "Действия",
        render: (store: AdminStore) => (
          <div className="admin-store-actions">
            <Button type="button" size="sm" variant="secondary" onClick={() => openCoverage(store)}>
              Привязать дом
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => openSettings(store)}>
              Доставка
            </Button>
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <section className="manager-screen admin-stores-page">
      <div className="manager-heading manager-heading--row">
        <div>
          <H1>Точки</H1>
          <Body tone="muted">Точки, дома, подписчики и настройки доставки</Body>
        </div>
        <Button type="button" onClick={() => setIsCreating(true)}>
          Создать точку
        </Button>
      </div>

      {isLoading ? <Loader label="Загружаем точки" /> : null}
      {!isLoading && loadError ? (
        <EmptyState
          title="Не удалось загрузить точки"
          description="Повторите попытку."
          action={
            <Button type="button" onClick={() => void loadStores()}>
              Повторить
            </Button>
          }
        />
      ) : null}
      {!isLoading && !loadError && stores.length === 0 ? (
        <EmptyState
          title="Точек пока нет"
          description="Создайте первую точку, чтобы настроить её зону доставки."
          action={
            <Button type="button" onClick={() => setIsCreating(true)}>
              Создать точку
            </Button>
          }
        />
      ) : null}
      {!isLoading && !loadError && stores.length > 0 ? (
        <Card className="manager-panel manager-panel--table">
          <Table columns={columns} data={stores} getRowKey={(store) => String(store.id)} />
        </Card>
      ) : null}

      <Modal
        open={isCreating}
        title="Создать точку"
        onClose={closeCreate}
        footer={
          <div className="manager-modal-actions">
            <Button type="button" variant="secondary" disabled={busyAction === "create"} onClick={closeCreate}>
              Отмена
            </Button>
            <Button type="button" disabled={busyAction === "create"} onClick={() => void submitStore()}>
              {busyAction === "create" ? <Spinner /> : "Создать"}
            </Button>
          </div>
        }
      >
        <div className="admin-store-form">
          <TextField
            label="Название"
            value={storeDraft.name}
            disabled={busyAction === "create"}
            onChange={(event) => setStoreDraft((draft) => ({ ...draft, name: event.target.value }))}
          />
          <TextField
            label="Адрес"
            value={storeDraft.address}
            disabled={busyAction === "create"}
            onChange={(event) => setStoreDraft((draft) => ({ ...draft, address: event.target.value }))}
          />
        </div>
      </Modal>

      <Modal
        open={Boolean(coverageStore)}
        title={coverageStore ? `Привязать дом: ${coverageStore.name}` : undefined}
        onClose={closeCoverage}
        footer={
          <div className="manager-modal-actions">
            <Button type="button" variant="secondary" disabled={busyAction === "coverage"} onClick={closeCoverage}>
              Отмена
            </Button>
            <Button type="button" disabled={busyAction === "coverage"} onClick={() => void submitCoverage()}>
              {busyAction === "coverage" ? <Spinner /> : "Привязать"}
            </Button>
          </div>
        }
      >
        <div className="admin-store-form">
          <TextField
            label="Адрес дома"
            value={coverageDraft.address}
            disabled={busyAction === "coverage"}
            onChange={(event) => setCoverageDraft((draft) => ({ ...draft, address: event.target.value }))}
          />
          <TextField
            label="Количество подъездов"
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            value={coverageDraft.entrance_count}
            disabled={busyAction === "coverage"}
            onChange={(event) => setCoverageDraft((draft) => ({ ...draft, entrance_count: event.target.value }))}
          />
        </div>
      </Modal>

      <Modal
        open={Boolean(settingsStore)}
        title={settingsStore ? `Доставка: ${settingsStore.name}` : undefined}
        onClose={closeSettings}
        footer={
          <div className="manager-modal-actions">
            <Button type="button" variant="secondary" disabled={busyAction === "settings"} onClick={closeSettings}>
              Отмена
            </Button>
            <Button type="button" disabled={busyAction === "settings"} onClick={() => void submitSettings()}>
              {busyAction === "settings" ? <Spinner /> : "Сохранить"}
            </Button>
          </div>
        }
      >
        <div className="admin-store-form">
          <TextField
            label="Порог бесплатной доставки"
            type="number"
            inputMode="decimal"
            value={settingsDraft.min_order_value_for_free_delivery}
            disabled={busyAction === "settings"}
            onChange={(event) =>
              setSettingsDraft((draft) => ({ ...draft, min_order_value_for_free_delivery: event.target.value }))
            }
          />
          <TextField
            label="Стоимость доставки"
            type="number"
            inputMode="decimal"
            value={settingsDraft.delivery_fee}
            disabled={busyAction === "settings"}
            onChange={(event) => setSettingsDraft((draft) => ({ ...draft, delivery_fee: event.target.value }))}
          />
          <TextField
            label="Начало окна приёма заказов"
            type="number"
            inputMode="numeric"
            step="1"
            value={settingsDraft.ordering_open_hour}
            disabled={busyAction === "settings"}
            onChange={(event) => setSettingsDraft((draft) => ({ ...draft, ordering_open_hour: event.target.value }))}
          />
          <TextField
            label="Окончание окна приёма заказов"
            type="number"
            inputMode="numeric"
            step="1"
            value={settingsDraft.ordering_close_hour}
            disabled={busyAction === "settings"}
            onChange={(event) => setSettingsDraft((draft) => ({ ...draft, ordering_close_hour: event.target.value }))}
          />
        </div>
      </Modal>
    </section>
  );
}
