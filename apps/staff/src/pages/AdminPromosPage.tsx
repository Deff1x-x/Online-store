import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Badge,
  Body,
  Button,
  Card,
  Dropdown,
  EmptyState,
  H1,
  Loader,
  Modal,
  Spinner,
  Switch,
  Table,
  TextField,
} from "@koz/ui";
import {
  formatDate,
  formatMoney,
  useApi,
  useToast,
  type AdminPromocode,
  type AdminPromocodeCreatePayload,
  type AdminPromocodeDiscountType,
} from "@koz/api";

type PromocodeDraft = {
  code: string;
  discount_type: AdminPromocodeDiscountType;
  discount_value: string;
  min_order_value: string;
  max_uses: string;
  usage_per_customer: string;
  valid_from: string;
  valid_until: string;
  is_active: boolean;
};

const discountTypeOptions = [
  { value: "fixed_amount", label: "Фиксированная" },
  { value: "percentage", label: "Процент" },
] as const;

const discountTypeLabels: Record<AdminPromocodeDiscountType, string> = Object.fromEntries(
  discountTypeOptions.map((option) => [option.value, option.label]),
) as Record<AdminPromocodeDiscountType, string>;

const emptyPromocodeDraft: PromocodeDraft = {
  code: "",
  discount_type: "fixed_amount",
  discount_value: "",
  min_order_value: "0",
  max_uses: "",
  usage_per_customer: "1",
  valid_from: "",
  valid_until: "",
  is_active: true,
};

const dateInputValue = (value: string | null) => (value ? value.slice(0, 10) : "");

const draftFromPromocode = (promocode: AdminPromocode): PromocodeDraft => ({
  code: promocode.code,
  discount_type: promocode.discount_type,
  discount_value: String(promocode.discount_value),
  min_order_value: String(promocode.min_order_value),
  max_uses: promocode.max_uses === null ? "" : String(promocode.max_uses),
  usage_per_customer: String(promocode.usage_per_customer),
  valid_from: dateInputValue(promocode.valid_from),
  valid_until: dateInputValue(promocode.valid_until),
  is_active: promocode.is_active,
});

const promocodePayload = (draft: PromocodeDraft): AdminPromocodeCreatePayload | null => {
  const code = draft.code.trim();
  const discountValueText = draft.discount_value.trim();
  const minOrderValueText = draft.min_order_value.trim();
  const usagePerCustomerText = draft.usage_per_customer.trim();
  const maxUsesText = draft.max_uses.trim();
  const discountValue = Number(discountValueText);
  const minOrderValue = Number(minOrderValueText);
  const usagePerCustomer = Number(usagePerCustomerText);
  const maxUses = maxUsesText === "" ? null : Number(maxUsesText);
  const hasDiscountType = discountTypeOptions.some((option) => option.value === draft.discount_type);

  if (
    !code ||
    !hasDiscountType ||
    discountValueText === "" ||
    !Number.isFinite(discountValue) ||
    discountValue <= 0 ||
    minOrderValueText === "" ||
    !Number.isFinite(minOrderValue) ||
    minOrderValue < 0 ||
    usagePerCustomerText === "" ||
    !Number.isInteger(usagePerCustomer) ||
    usagePerCustomer <= 0 ||
    (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 0))
  ) {
    return null;
  }

  return {
    code,
    discount_type: draft.discount_type,
    discount_value: discountValue,
    min_order_value: minOrderValue,
    max_uses: maxUses,
    usage_per_customer: usagePerCustomer,
    valid_from: draft.valid_from || null,
    valid_until: draft.valid_until || null,
    is_active: draft.is_active,
  };
};

const discountValueLabel = (promocode: AdminPromocode) =>
  promocode.discount_type === "fixed_amount" ? formatMoney(promocode.discount_value) : `${promocode.discount_value}%`;

export default function AdminPromosPage() {
  const { modules } = useApi();
  const { showToast } = useToast();
  const [promocodes, setPromocodes] = useState<AdminPromocode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingPromocode, setEditingPromocode] = useState<AdminPromocode | null>(null);
  const [deactivatingPromocode, setDeactivatingPromocode] = useState<AdminPromocode | null>(null);
  const [draft, setDraft] = useState<PromocodeDraft>(emptyPromocodeDraft);
  const [busyAction, setBusyAction] = useState<"create" | "edit" | "deactivate" | "activate" | null>(null);

  const loadPromocodes = useCallback(async () => {
    setIsLoading(true);
    setLoadError(false);

    try {
      const response = await modules.adminCatalogApi.getPromoCodes();
      setPromocodes(response.promo_codes);
    } catch {
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, [modules.adminCatalogApi]);

  useEffect(() => {
    void loadPromocodes();
  }, [loadPromocodes]);

  const closeCreate = () => {
    setIsCreateOpen(false);
    setDraft(emptyPromocodeDraft);
  };

  const closeEdit = () => {
    setEditingPromocode(null);
    setDraft(emptyPromocodeDraft);
  };

  const submitCreate = async () => {
    const payload = promocodePayload(draft);
    if (!payload) {
      showToast({ message: "Заполните код, тип скидки и корректные числовые параметры.", tone: "warning" });
      return;
    }

    setBusyAction("create");
    try {
      await modules.adminCatalogApi.createPromoCode(payload);
      closeCreate();
      await loadPromocodes();
      showToast({ message: "Промокод создан.", tone: "success" });
    } finally {
      setBusyAction(null);
    }
  };

  const openEdit = (promocode: AdminPromocode) => {
    setEditingPromocode(promocode);
    setDraft(draftFromPromocode(promocode));
  };

  const submitEdit = async () => {
    if (!editingPromocode) return;

    const payload = promocodePayload(draft);
    if (!payload) {
      showToast({ message: "Заполните код, тип скидки и корректные числовые параметры.", tone: "warning" });
      return;
    }

    setBusyAction("edit");
    try {
      await modules.adminCatalogApi.updatePromoCode(editingPromocode.id, payload);
      closeEdit();
      await loadPromocodes();
      showToast({ message: "Промокод обновлён.", tone: "success" });
    } finally {
      setBusyAction(null);
    }
  };

  const deactivatePromocode = async () => {
    if (!deactivatingPromocode) return;

    setBusyAction("deactivate");
    try {
      await modules.adminCatalogApi.deletePromoCode(deactivatingPromocode.id);
      setDeactivatingPromocode(null);
      await loadPromocodes();
      showToast({ message: "Промокод деактивирован.", tone: "success" });
    } finally {
      setBusyAction(null);
    }
  };

  const activatePromocode = async (promocode: AdminPromocode) => {
    setBusyAction("activate");
    try {
      await modules.adminCatalogApi.updatePromoCode(promocode.id, { is_active: true });
      await loadPromocodes();
      showToast({ message: "Промокод активирован.", tone: "success" });
    } finally {
      setBusyAction(null);
    }
  };

  const columns = useMemo(
    () => [
      { key: "code", header: "Код", render: (promocode: AdminPromocode) => <strong>{promocode.code}</strong> },
      { key: "type", header: "Тип скидки", render: (promocode: AdminPromocode) => discountTypeLabels[promocode.discount_type] },
      { key: "value", header: "Значение", render: (promocode: AdminPromocode) => discountValueLabel(promocode) },
      { key: "min_order", header: "Мин. сумма", render: (promocode: AdminPromocode) => formatMoney(promocode.min_order_value) },
      { key: "max_uses", header: "Лимит", render: (promocode: AdminPromocode) => promocode.max_uses === null ? "Без лимита" : promocode.max_uses },
      { key: "per_customer", header: "На клиента", render: (promocode: AdminPromocode) => promocode.usage_per_customer },
      { key: "valid_from", header: "Начало", render: (promocode: AdminPromocode) => promocode.valid_from ? formatDate(promocode.valid_from) : "—" },
      { key: "valid_until", header: "Окончание", render: (promocode: AdminPromocode) => promocode.valid_until ? formatDate(promocode.valid_until) : "—" },
      {
        key: "active",
        header: "Активность",
        render: (promocode: AdminPromocode) => <Badge tone={promocode.is_active ? "success" : "neutral"}>{promocode.is_active ? "Активен" : "Неактивен"}</Badge>,
      },
      {
        key: "actions",
        header: "Действия",
        render: (promocode: AdminPromocode) => (
          <div className="admin-store-actions">
            <Button type="button" size="sm" variant="secondary" disabled={busyAction !== null} onClick={() => openEdit(promocode)}>
              Изменить
            </Button>
            {promocode.is_active ? (
              <Button type="button" size="sm" variant="danger" disabled={busyAction !== null} onClick={() => setDeactivatingPromocode(promocode)}>
                Деактивировать
              </Button>
            ) : (
              <Button type="button" size="sm" disabled={busyAction !== null} onClick={() => void activatePromocode(promocode)}>
                Активировать
              </Button>
            )}
          </div>
        ),
      },
    ],
    [busyAction],
  );

  return (
    <section className="manager-screen">
      <div className="manager-heading manager-heading--row">
        <div>
          <H1>Промокоды</H1>
          <Body tone="muted">Параметры действия и активность промокодов</Body>
        </div>
        <Button type="button" disabled={busyAction !== null} onClick={() => setIsCreateOpen(true)}>
          Создать промокод
        </Button>
      </div>

      {isLoading ? <Loader label="Загружаем промокоды" /> : null}
      {!isLoading && loadError ? (
        <EmptyState
          title="Не удалось загрузить промокоды"
          description="Повторите попытку."
          action={<Button type="button" onClick={() => void loadPromocodes()}>Повторить</Button>}
        />
      ) : null}
      {!isLoading && !loadError && promocodes.length === 0 ? (
        <EmptyState
          title="Промокодов пока нет"
          description="Создайте первый промокод."
          action={<Button type="button" onClick={() => setIsCreateOpen(true)}>Создать промокод</Button>}
        />
      ) : null}
      {!isLoading && !loadError && promocodes.length > 0 ? (
        <Card className="manager-panel manager-panel--table">
          <Table columns={columns} data={promocodes} getRowKey={(promocode) => promocode.id} />
        </Card>
      ) : null}

      <Modal
        open={isCreateOpen}
        title="Создать промокод"
        onClose={closeCreate}
        footer={
          <div className="manager-modal-actions">
            <Button type="button" variant="secondary" disabled={busyAction === "create"} onClick={closeCreate}>Отмена</Button>
            <Button type="button" disabled={busyAction === "create"} onClick={() => void submitCreate()}>
              {busyAction === "create" ? <Spinner /> : "Создать"}
            </Button>
          </div>
        }
      >
        <PromocodeForm draft={draft} disabled={busyAction === "create"} onChange={setDraft} />
      </Modal>

      <Modal
        open={Boolean(editingPromocode)}
        title={editingPromocode ? `Изменить: ${editingPromocode.code}` : undefined}
        onClose={closeEdit}
        footer={
          <div className="manager-modal-actions">
            <Button type="button" variant="secondary" disabled={busyAction === "edit"} onClick={closeEdit}>Отмена</Button>
            <Button type="button" disabled={busyAction === "edit"} onClick={() => void submitEdit()}>
              {busyAction === "edit" ? <Spinner /> : "Сохранить"}
            </Button>
          </div>
        }
      >
        <PromocodeForm draft={draft} disabled={busyAction === "edit"} onChange={setDraft} />
      </Modal>

      <Modal
        open={Boolean(deactivatingPromocode)}
        title={deactivatingPromocode ? `Деактивировать: ${deactivatingPromocode.code}` : undefined}
        onClose={() => setDeactivatingPromocode(null)}
        footer={
          <div className="manager-modal-actions">
            <Button type="button" variant="secondary" disabled={busyAction === "deactivate"} onClick={() => setDeactivatingPromocode(null)}>Отмена</Button>
            <Button type="button" variant="danger" disabled={busyAction === "deactivate"} onClick={() => void deactivatePromocode()}>
              {busyAction === "deactivate" ? <Spinner /> : "Деактивировать"}
            </Button>
          </div>
        }
      >
        <Body tone="muted">Промокод станет неактивным и не будет удалён физически.</Body>
      </Modal>
    </section>
  );
}

function PromocodeForm({
  draft,
  disabled,
  onChange,
}: {
  draft: PromocodeDraft;
  disabled: boolean;
  onChange: (draft: PromocodeDraft) => void;
}) {
  return (
    <div className="admin-store-form">
      <TextField label="Код" value={draft.code} disabled={disabled} onChange={(event) => onChange({ ...draft, code: event.target.value })} />
      <Dropdown
        label="Тип скидки"
        value={draft.discount_type}
        options={discountTypeOptions}
        disabled={disabled}
        onChange={(event) => onChange({ ...draft, discount_type: event.target.value as AdminPromocodeDiscountType })}
      />
      <TextField
        label="Значение скидки"
        type="number"
        inputMode="decimal"
        min="0"
        value={draft.discount_value}
        disabled={disabled}
        onChange={(event) => onChange({ ...draft, discount_value: event.target.value })}
      />
      <TextField
        label="Минимальная сумма заказа"
        type="number"
        inputMode="decimal"
        min="0"
        value={draft.min_order_value}
        disabled={disabled}
        onChange={(event) => onChange({ ...draft, min_order_value: event.target.value })}
      />
      <TextField
        label="Лимит использований"
        helperText="Оставьте пустым для отсутствия лимита."
        type="number"
        inputMode="numeric"
        min="0"
        step="1"
        value={draft.max_uses}
        disabled={disabled}
        onChange={(event) => onChange({ ...draft, max_uses: event.target.value })}
      />
      <TextField
        label="Использований на клиента"
        type="number"
        inputMode="numeric"
        min="1"
        step="1"
        value={draft.usage_per_customer}
        disabled={disabled}
        onChange={(event) => onChange({ ...draft, usage_per_customer: event.target.value })}
      />
      <TextField label="Начало действия" type="date" value={draft.valid_from} disabled={disabled} onChange={(event) => onChange({ ...draft, valid_from: event.target.value })} />
      <TextField label="Окончание действия" type="date" value={draft.valid_until} disabled={disabled} onChange={(event) => onChange({ ...draft, valid_until: event.target.value })} />
      <Switch label="Промокод активен" checked={draft.is_active} disabled={disabled} onChange={(event) => onChange({ ...draft, is_active: event.target.checked })} />
    </div>
  );
}
