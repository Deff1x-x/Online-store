import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge, Body, Button, Card, Dropdown, EmptyState, H1, Loader, Modal, Pagination, Spinner, Table, TextField } from "@koz/ui";
import { formatDate, formatMoney, formatPhone, useApi, useToast, type AdminCustomer, type AdminCustomerDetails, type SubscriptionStatus } from "@koz/api";

const statusOptions = [
  { value: "", label: "Все статусы" },
  { value: "active", label: "Активна" },
  { value: "paused", label: "На паузе" },
  { value: "cancelled", label: "Отменена" },
  { value: "expired", label: "Истекла" },
];

const addressLine = (address: AdminCustomerDetails["addresses"][number]) =>
  [address.coverage_address, address.entrance && `подъезд ${address.entrance}`, address.floor && `этаж ${address.floor}`, address.apartment && `кв. ${address.apartment}`]
    .filter(Boolean)
    .join(", ");

export default function AdminCustomersPage() {
  const { modules } = useApi();
  const { showToast } = useToast();
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [storeId, setStoreId] = useState("");
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | "">("");
  const [appliedFilters, setAppliedFilters] = useState<{ search: string; storeId: string; subscriptionStatus: SubscriptionStatus | "" }>({ search: "", storeId: "", subscriptionStatus: "" });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [details, setDetails] = useState<AdminCustomerDetails | null>(null);
  const [isDetailsLoading, setIsDetailsLoading] = useState(false);
  const [detailsLoadError, setDetailsLoadError] = useState(false);
  const [action, setAction] = useState<"renew" | "pause" | "cancel" | null>(null);
  const [busyAction, setBusyAction] = useState(false);
  const pageSize = 20;
  const customersRequestId = useRef(0);
  const detailsRequestId = useRef(0);

  const loadCustomers = useCallback(async () => {
    const requestId = ++customersRequestId.current;
    setIsLoading(true);
    setLoadError(false);
    try {
      const response = await modules.adminCustomersApi.getCustomers({
        page,
        limit: pageSize,
        search: appliedFilters.search || undefined,
        store_id: appliedFilters.storeId || undefined,
        subscription_status: appliedFilters.subscriptionStatus || undefined,
      });
      if (requestId === customersRequestId.current) {
        setCustomers(response.customers);
        setTotal(response.pagination.total);
      }
    } catch {
      if (requestId === customersRequestId.current) setLoadError(true);
    } finally {
      if (requestId === customersRequestId.current) setIsLoading(false);
    }
  }, [appliedFilters, modules.adminCustomersApi, page]);

  useEffect(() => { void loadCustomers(); }, [loadCustomers]);

  const applyFilters = () => {
    setPage(1);
    setAppliedFilters({
      search: search.trim(),
      storeId: storeId.trim(),
      subscriptionStatus,
    });
  };

  const openDetails = async (customer: AdminCustomer) => {
    const requestId = ++detailsRequestId.current;
    setDetails({ customer, addresses: [], recent_orders: [] });
    setIsDetailsLoading(true);
    setDetailsLoadError(false);
    try {
      const response = await modules.adminCustomersApi.getCustomer(customer.id);
      if (requestId === detailsRequestId.current) setDetails(response);
    } catch {
      if (requestId === detailsRequestId.current) setDetailsLoadError(true);
    } finally {
      if (requestId === detailsRequestId.current) setIsDetailsLoading(false);
    }
  };

  const closeDetails = () => {
    detailsRequestId.current += 1;
    setDetails(null);
    setDetailsLoadError(false);
  };

  const runSubscriptionAction = async () => {
    if (!details || !action) return;
    setBusyAction(true);
    try {
      if (action === "renew") await modules.adminCustomersApi.renewSubscription(details.customer.id);
      if (action === "pause") await modules.adminCustomersApi.pauseSubscription(details.customer.id);
      if (action === "cancel") await modules.adminCustomersApi.cancelSubscription(details.customer.id);
      setAction(null);
      await Promise.all([loadCustomers(), openDetails(details.customer)]);
      showToast({ message: "Статус подписки обновлён.", tone: "success" });
    } finally {
      setBusyAction(false);
    }
  };

  const columns = useMemo(() => [
    { key: "name", header: "Клиент", render: (customer: AdminCustomer) => <strong>{customer.name ?? "—"}</strong> },
    { key: "phone", header: "Телефон", render: (customer: AdminCustomer) => formatPhone(customer.phone) },
    { key: "email", header: "Email", render: (customer: AdminCustomer) => customer.email ?? "—" },
    { key: "store", header: "Точка", render: (customer: AdminCustomer) => customer.store_id },
    { key: "subscription", header: "Подписка", render: (customer: AdminCustomer) => <Badge tone={customer.subscription_status === "active" ? "success" : "neutral"}>{customer.subscription_status}</Badge> },
    { key: "registered", header: "Регистрация", render: (customer: AdminCustomer) => formatDate(customer.created_at) },
    { key: "orders", header: "Заказы", render: (customer: AdminCustomer) => customer.orders_count },
    { key: "actions", header: "Действия", render: (customer: AdminCustomer) => <Button type="button" size="sm" variant="secondary" onClick={() => void openDetails(customer)}>Карточка</Button> },
  ], []);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section className="manager-screen">
      <div className="manager-heading"><H1>Клиенты</H1><Body tone="muted">Поиск, подписки, адреса и последние заказы</Body></div>
      <Card className="manager-panel">
        <div className="admin-store-form">
          <TextField label="Поиск по имени или телефону" value={search} onChange={(event) => setSearch(event.target.value)} />
          <TextField label="ID точки" value={storeId} onChange={(event) => setStoreId(event.target.value)} />
          <Dropdown label="Статус подписки" value={subscriptionStatus} options={statusOptions} onChange={(event) => setSubscriptionStatus(event.target.value as SubscriptionStatus | "")} />
          <Button type="button" onClick={applyFilters}>Применить фильтры</Button>
        </div>
      </Card>
      {isLoading ? <Loader label="Загружаем клиентов" /> : null}
      {!isLoading && loadError ? <EmptyState title="Не удалось загрузить клиентов" description="Повторите попытку." action={<Button type="button" onClick={() => void loadCustomers()}>Повторить</Button>} /> : null}
      {!isLoading && !loadError && customers.length === 0 ? <EmptyState title="Клиенты не найдены" description="Измените параметры поиска или фильтра." /> : null}
      {!isLoading && !loadError && customers.length > 0 ? <Card className="manager-panel manager-panel--table"><Table columns={columns} data={customers} getRowKey={(customer) => customer.id} /></Card> : null}
      {!isLoading && !loadError && total > 0 ? <Pagination page={page} pageCount={pageCount} onPageChange={setPage} /> : null}
      <Modal open={Boolean(details)} title={details ? `Клиент: ${details.customer.name ?? details.customer.phone}` : undefined} onClose={closeDetails} footer={<div className="manager-modal-actions"><Button type="button" variant="secondary" onClick={closeDetails}>Закрыть</Button></div>}>
        {isDetailsLoading ? <Loader label="Загружаем карточку" /> : null}
        {details && !isDetailsLoading && detailsLoadError ? <EmptyState title="Не удалось загрузить карточку" description="Повторите попытку." action={<Button type="button" onClick={() => void openDetails(details.customer)}>Повторить</Button>} /> : null}
        {details && !isDetailsLoading && !detailsLoadError ? <CustomerDetails details={details} onAction={setAction} /> : null}
      </Modal>
      <Modal open={Boolean(action)} title="Изменить подписку" onClose={() => setAction(null)} footer={<div className="manager-modal-actions"><Button type="button" variant="secondary" disabled={busyAction} onClick={() => setAction(null)}>Отмена</Button><Button type="button" disabled={busyAction} onClick={() => void runSubscriptionAction()}>{busyAction ? <Spinner /> : "Подтвердить"}</Button></div>}>
        <Body tone="muted">Подтвердить действие с подпиской клиента?</Body>
      </Modal>
    </section>
  );
}

function CustomerDetails({ details, onAction }: { details: AdminCustomerDetails; onAction: (action: "renew" | "pause" | "cancel") => void }) {
  const { customer, addresses, recent_orders: recentOrders } = details;
  return <div className="admin-store-form">
    <div><strong>{customer.name ?? "—"}</strong><Body tone="muted">{formatPhone(customer.phone)} · {customer.email ?? "Email не указан"}</Body></div>
    <div><strong>Подписка</strong><Body tone="muted">Статус: {customer.subscription_status}; до: {customer.subscription_end_date ? formatDate(customer.subscription_end_date) : "—"}; автопродление: {customer.subscription_auto_renew ? "включено" : "выключено"}</Body><div className="admin-store-actions"><Button type="button" size="sm" onClick={() => onAction("renew")}>Продлить</Button><Button type="button" size="sm" variant="secondary" onClick={() => onAction("pause")}>Пауза</Button><Button type="button" size="sm" variant="danger" onClick={() => onAction("cancel")}>Отменить</Button></div></div>
    <div><strong>Адреса</strong>{addresses.length ? addresses.map((address) => <Body key={address.id} tone="muted">{addressLine(address)}{address.is_default ? " · основной" : ""}</Body>) : <Body tone="muted">Адресов нет</Body>}</div>
    <div><strong>Последние заказы</strong>{recentOrders.length ? recentOrders.map((order) => <Body key={order.id} tone="muted">{order.order_number ?? order.id} · {formatDate(order.created_at)} · {order.delivery_status} · {formatMoney(order.final_total)}</Body>) : <Body tone="muted">Заказов нет</Body>}</div>
  </div>;
}
