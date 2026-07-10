import { useMemo, useRef, useState } from "react";
import { Badge, Body, Button, Card, Dropdown, EmptyState, H1, H2, Loader, Pagination, Spinner, Table, TextField } from "@koz/ui";
import {
  formatDate,
  formatMoney,
  useApi,
  useToast,
  type AdminDeliveryAnalytics,
  type AdminPayment,
  type AdminPaymentMethod,
  type AdminPaymentRecordStatus,
  type AdminRevenueAnalytics,
  type AdminStoreReport,
} from "@koz/api";

const paymentsPageSize = 20;

const paymentMethodOptions = [
  { value: "", label: "Все способы" },
  { value: "online", label: "Онлайн" },
  { value: "pos_terminal", label: "POS-терминал" },
  { value: "kaspi", label: "Kaspi" },
] as const;

const paymentStatusOptions = [
  { value: "", label: "Все статусы" },
  { value: "pending", label: "Ожидает" },
  { value: "completed", label: "Завершён" },
  { value: "failed", label: "Ошибка" },
  { value: "refunded", label: "Возвращён" },
  { value: "cancelled", label: "Отменён" },
] as const;

const paymentMethodLabels: Record<AdminPaymentMethod, string> = {
  online: "Онлайн",
  pos_terminal: "POS-терминал",
  kaspi: "Kaspi",
};

const paymentStatusLabels: Record<AdminPaymentRecordStatus, string> = {
  pending: "Ожидает",
  completed: "Завершён",
  failed: "Ошибка",
  refunded: "Возвращён",
  cancelled: "Отменён",
};

export default function AdminOperationsPage() {
  const { modules } = useApi();
  const { showToast } = useToast();
  const storeReportRequestId = useRef(0);
  const revenueRequestId = useRef(0);
  const deliveryRequestId = useRef(0);
  const paymentsRequestId = useRef(0);
  const [storeId, setStoreId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [report, setReport] = useState<AdminStoreReport | null>(null);
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [reportLoadError, setReportLoadError] = useState(false);
  const [hasRequestedReport, setHasRequestedReport] = useState(false);
  const [revenue, setRevenue] = useState<AdminRevenueAnalytics[]>([]);
  const [isLoadingRevenue, setIsLoadingRevenue] = useState(false);
  const [revenueLoadError, setRevenueLoadError] = useState(false);
  const [hasRequestedRevenue, setHasRequestedRevenue] = useState(false);
  const [delivery, setDelivery] = useState<AdminDeliveryAnalytics[]>([]);
  const [isLoadingDelivery, setIsLoadingDelivery] = useState(false);
  const [deliveryLoadError, setDeliveryLoadError] = useState(false);
  const [hasRequestedDelivery, setHasRequestedDelivery] = useState(false);
  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [paymentsTotal, setPaymentsTotal] = useState(0);
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [paymentStoreId, setPaymentStoreId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<AdminPaymentMethod | "">("");
  const [paymentStatus, setPaymentStatus] = useState<AdminPaymentRecordStatus | "">("");
  const [isLoadingPayments, setIsLoadingPayments] = useState(false);
  const [paymentsLoadError, setPaymentsLoadError] = useState(false);
  const [hasRequestedPayments, setHasRequestedPayments] = useState(false);

  const resetStoreReport = () => {
    storeReportRequestId.current += 1;
    setReport(null);
    setIsLoadingReport(false);
    setReportLoadError(false);
    setHasRequestedReport(false);
  };

  const resetRevenue = () => {
    revenueRequestId.current += 1;
    setRevenue([]);
    setIsLoadingRevenue(false);
    setRevenueLoadError(false);
    setHasRequestedRevenue(false);
  };

  const resetDelivery = () => {
    deliveryRequestId.current += 1;
    setDelivery([]);
    setIsLoadingDelivery(false);
    setDeliveryLoadError(false);
    setHasRequestedDelivery(false);
  };

  const resetPayments = () => {
    paymentsRequestId.current += 1;
    setPayments([]);
    setPaymentsTotal(0);
    setPaymentsPage(1);
    setIsLoadingPayments(false);
    setPaymentsLoadError(false);
    setHasRequestedPayments(false);
  };

  const resetPeriodResults = () => {
    resetStoreReport();
    resetRevenue();
    resetDelivery();
    resetPayments();
  };

  const loadStoreReport = async () => {
    const normalizedStoreId = storeId.trim();

    if (!normalizedStoreId) {
      showToast({ message: "Укажите ID точки.", tone: "warning" });
      return;
    }

    const requestId = storeReportRequestId.current + 1;
    storeReportRequestId.current = requestId;
    setHasRequestedReport(true);
    setIsLoadingReport(true);
    setReportLoadError(false);
    setReport(null);

    try {
      const response = await modules.adminOperationsApi.getStoreReport(normalizedStoreId, {
        ...(dateFrom ? { date_from: dateFrom } : {}),
        ...(dateTo ? { date_to: dateTo } : {}),
      });

      if (requestId === storeReportRequestId.current) setReport(response.report);
    } catch {
      if (requestId === storeReportRequestId.current) setReportLoadError(true);
    } finally {
      if (requestId === storeReportRequestId.current) setIsLoadingReport(false);
    }
  };

  const loadRevenue = async () => {
    const requestId = revenueRequestId.current + 1;
    revenueRequestId.current = requestId;
    setHasRequestedRevenue(true);
    setIsLoadingRevenue(true);
    setRevenueLoadError(false);
    setRevenue([]);

    try {
      const response = await modules.adminOperationsApi.getRevenueAnalytics({
        ...(dateFrom ? { date_from: dateFrom } : {}),
        ...(dateTo ? { date_to: dateTo } : {}),
      });
      if (requestId === revenueRequestId.current) setRevenue(response.revenue);
    } catch {
      if (requestId === revenueRequestId.current) setRevenueLoadError(true);
    } finally {
      if (requestId === revenueRequestId.current) setIsLoadingRevenue(false);
    }
  };

  const loadDelivery = async () => {
    const requestId = deliveryRequestId.current + 1;
    deliveryRequestId.current = requestId;
    setHasRequestedDelivery(true);
    setIsLoadingDelivery(true);
    setDeliveryLoadError(false);
    setDelivery([]);

    try {
      const response = await modules.adminOperationsApi.getDeliveryAnalytics({
        ...(dateFrom ? { date_from: dateFrom } : {}),
        ...(dateTo ? { date_to: dateTo } : {}),
      });
      if (requestId === deliveryRequestId.current) setDelivery(response.delivery);
    } catch {
      if (requestId === deliveryRequestId.current) setDeliveryLoadError(true);
    } finally {
      if (requestId === deliveryRequestId.current) setIsLoadingDelivery(false);
    }
  };

  const loadPayments = async (page = 1) => {
    const requestId = paymentsRequestId.current + 1;
    paymentsRequestId.current = requestId;
    setPaymentsPage(page);
    setHasRequestedPayments(true);
    setIsLoadingPayments(true);
    setPaymentsLoadError(false);
    setPayments([]);

    try {
      const response = await modules.adminOperationsApi.getPayments({
        page,
        limit: paymentsPageSize,
        ...(paymentStoreId.trim() ? { store_id: paymentStoreId.trim() } : {}),
        ...(paymentMethod ? { method: paymentMethod } : {}),
        ...(paymentStatus ? { status: paymentStatus } : {}),
        ...(dateFrom ? { date_from: dateFrom } : {}),
        ...(dateTo ? { date_to: dateTo } : {}),
      });
      if (requestId === paymentsRequestId.current) {
        setPayments(response.payments);
        setPaymentsTotal(response.pagination.total);
        setPaymentsPage(response.pagination.page);
      }
    } catch {
      if (requestId === paymentsRequestId.current) setPaymentsLoadError(true);
    } finally {
      if (requestId === paymentsRequestId.current) setIsLoadingPayments(false);
    }
  };

  const revenueColumns = useMemo(
    () => [
      { key: "store", header: "Точка", render: (item: AdminRevenueAnalytics) => <strong>{item.store_name}</strong> },
      { key: "orders", header: "Заказы", render: (item: AdminRevenueAnalytics) => item.orders_count },
      { key: "gmv", header: "GMV", render: (item: AdminRevenueAnalytics) => formatMoney(item.gmv) },
      { key: "delivery_fee", header: "Доставка", render: (item: AdminRevenueAnalytics) => formatMoney(item.delivery_fee_total) },
      { key: "discount", header: "Скидки", render: (item: AdminRevenueAnalytics) => formatMoney(item.discount_total) },
      { key: "average", header: "Средний чек", render: (item: AdminRevenueAnalytics) => formatMoney(item.avg_order_value) },
    ],
    [],
  );

  const deliveryColumns = useMemo(
    () => [
      { key: "store", header: "Точка", render: (item: AdminDeliveryAnalytics) => <strong>{item.store_name}</strong> },
      { key: "orders", header: "Заказы", render: (item: AdminDeliveryAnalytics) => item.totals },
      { key: "delivered", header: "Доставлено", render: (item: AdminDeliveryAnalytics) => item.delivered },
      { key: "failed", header: "Не доставлено", render: (item: AdminDeliveryAnalytics) => item.failed },
      { key: "duration", header: "Ср. время, мин.", render: (item: AdminDeliveryAnalytics) => item.avg_delivery_minutes },
      { key: "next_morning", header: "На следующее утро", render: (item: AdminDeliveryAnalytics) => item.next_morning_orders },
    ],
    [],
  );

  const paymentColumns = useMemo(
    () => [
      { key: "id", header: "Платёж", render: (payment: AdminPayment) => payment.id },
      { key: "order", header: "Заказ", render: (payment: AdminPayment) => payment.order_number ?? payment.order_id },
      { key: "store", header: "Точка", render: (payment: AdminPayment) => payment.store_name },
      { key: "amount", header: "Сумма", render: (payment: AdminPayment) => formatMoney(payment.amount) },
      { key: "method", header: "Способ", render: (payment: AdminPayment) => paymentMethodLabels[payment.method] },
      {
        key: "status",
        header: "Статус",
        render: (payment: AdminPayment) => (
          <Badge tone={payment.status === "completed" ? "success" : payment.status === "failed" ? "danger" : "neutral"}>
            {paymentStatusLabels[payment.status]}
          </Badge>
        ),
      },
      { key: "created", header: "Создан", render: (payment: AdminPayment) => formatDate(payment.created_at) },
    ],
    [],
  );

  const hasOrders = report !== null && report.orders.totals > 0;
  const paymentsPageCount = Math.max(1, Math.ceil(paymentsTotal / paymentsPageSize));

  return (
    <section className="manager-screen">
      <div className="manager-heading">
        <H1>Отчёты</H1>
        <Body tone="muted">Период применяется к отчёту по точке, выручке, доставке и реестру платежей.</Body>
      </div>

      <section aria-labelledby="store-report-heading">
        <div className="manager-panel__heading">
          <H2 id="store-report-heading">Отчёт по точке</H2>
        </div>
        <Card className="manager-panel">
          <form
            className="admin-store-form"
            onSubmit={(event) => {
              event.preventDefault();
              void loadStoreReport();
            }}
          >
            <TextField
              label="ID точки"
              value={storeId}
              disabled={isLoadingReport}
              onChange={(event) => {
                resetStoreReport();
                setStoreId(event.target.value);
              }}
            />
            <TextField
              label="Дата с"
              type="date"
              value={dateFrom}
              disabled={isLoadingReport}
              onChange={(event) => {
                resetPeriodResults();
                setDateFrom(event.target.value);
              }}
            />
            <TextField
              label="Дата по"
              type="date"
              value={dateTo}
              disabled={isLoadingReport}
              onChange={(event) => {
                resetPeriodResults();
                setDateTo(event.target.value);
              }}
            />
            <Button type="submit" disabled={isLoadingReport} leftIcon={isLoadingReport ? <Spinner /> : undefined}>
              Загрузить отчёт
            </Button>
          </form>
        </Card>

        {isLoadingReport ? <Loader label="Загружаем отчёт" /> : null}
        {!isLoadingReport && reportLoadError ? (
          <EmptyState
            title="Не удалось загрузить отчёт"
            description="Проверьте ID точки и повторите попытку."
            action={<Button type="button" onClick={() => void loadStoreReport()}>Повторить</Button>}
          />
        ) : null}
        {!isLoadingReport && !reportLoadError && !hasRequestedReport ? (
          <EmptyState title="Укажите ID точки" description="Список точек недоступен роли операций, поэтому используйте идентификатор точки." />
        ) : null}
        {!isLoadingReport && !reportLoadError && report && !hasOrders ? (
          <EmptyState title="За выбранный период операций нет" description={`Точка: ${report.store.name}.`} />
        ) : null}
        {!isLoadingReport && !reportLoadError && report && hasOrders ? (
          <>
            <div className="manager-heading">
              <H2>{report.store.name}</H2>
              <Body tone="muted">{report.store.address}</Body>
            </div>
            <div className="manager-metric-grid manager-metric-grid--money">
              <Card className="manager-metric manager-metric--wide"><span>GMV</span><strong>{formatMoney(report.orders.gmv)}</strong></Card>
              <Card className="manager-metric manager-metric--wide"><span>Онлайн</span><strong>{formatMoney(report.orders.online_part)}</strong></Card>
              <Card className="manager-metric manager-metric--wide"><span>POS</span><strong>{formatMoney(report.orders.pos_part)}</strong></Card>
              <Card className="manager-metric manager-metric--wide"><span>Средний чек</span><strong>{formatMoney(report.orders.avg)}</strong></Card>
            </div>
            <div className="manager-metric-grid">
              <Card className="manager-metric"><span>Заказы</span><strong>{report.orders.totals}</strong></Card>
              <Card className="manager-metric"><span>Доставлено</span><strong>{report.orders.delivered}</strong></Card>
              <Card className="manager-metric"><span>Не доставлено</span><strong>{report.orders.failed}</strong></Card>
              <Card className="manager-metric"><span>Подписчики</span><strong>{report.subscribers.total}</strong></Card>
              <Card className="manager-metric"><span>Активные подписчики</span><strong>{report.subscribers.active}</strong></Card>
            </div>
          </>
        ) : null}
      </section>

      <section aria-labelledby="revenue-heading">
        <div className="manager-panel__heading">
          <H2 id="revenue-heading">Выручка по сети</H2>
          <Button type="button" size="sm" disabled={isLoadingRevenue} leftIcon={isLoadingRevenue ? <Spinner /> : undefined} onClick={() => void loadRevenue()}>
            Загрузить
          </Button>
        </div>
        {isLoadingRevenue ? <Loader label="Загружаем выручку" /> : null}
        {!isLoadingRevenue && revenueLoadError ? <EmptyState title="Не удалось загрузить выручку" action={<Button type="button" onClick={() => void loadRevenue()}>Повторить</Button>} /> : null}
        {!isLoadingRevenue && !revenueLoadError && !hasRequestedRevenue ? <EmptyState title="Загрузите выручку по сети" description="Используется выбранный период отчёта." /> : null}
        {!isLoadingRevenue && !revenueLoadError && hasRequestedRevenue && revenue.length === 0 ? <EmptyState title="Данных по выручке нет" /> : null}
        {!isLoadingRevenue && !revenueLoadError && revenue.length > 0 ? <Card className="manager-panel manager-panel--table"><Table columns={revenueColumns} data={revenue} getRowKey={(item) => item.store_id} /></Card> : null}
      </section>

      <section aria-labelledby="delivery-heading">
        <div className="manager-panel__heading">
          <H2 id="delivery-heading">Доставка и невыкуп</H2>
          <Button type="button" size="sm" disabled={isLoadingDelivery} leftIcon={isLoadingDelivery ? <Spinner /> : undefined} onClick={() => void loadDelivery()}>
            Загрузить
          </Button>
        </div>
        {isLoadingDelivery ? <Loader label="Загружаем показатели доставки" /> : null}
        {!isLoadingDelivery && deliveryLoadError ? <EmptyState title="Не удалось загрузить показатели доставки" action={<Button type="button" onClick={() => void loadDelivery()}>Повторить</Button>} /> : null}
        {!isLoadingDelivery && !deliveryLoadError && !hasRequestedDelivery ? <EmptyState title="Загрузите показатели доставки" description="Используется выбранный период отчёта." /> : null}
        {!isLoadingDelivery && !deliveryLoadError && hasRequestedDelivery && delivery.length === 0 ? <EmptyState title="Данных по доставке нет" /> : null}
        {!isLoadingDelivery && !deliveryLoadError && delivery.length > 0 ? <Card className="manager-panel manager-panel--table"><Table columns={deliveryColumns} data={delivery} getRowKey={(item) => item.store_id} /></Card> : null}
      </section>

      <section aria-labelledby="payments-heading">
        <div className="manager-panel__heading">
          <H2 id="payments-heading">Реестр платежей</H2>
        </div>
        <Card className="manager-panel">
          <form
            className="admin-store-form"
            onSubmit={(event) => {
              event.preventDefault();
              void loadPayments(1);
            }}
          >
            <TextField
              label="ID точки"
              value={paymentStoreId}
              disabled={isLoadingPayments}
              onChange={(event) => {
                resetPayments();
                setPaymentStoreId(event.target.value);
              }}
            />
            <Dropdown
              label="Способ оплаты"
              value={paymentMethod}
              disabled={isLoadingPayments}
              options={paymentMethodOptions}
              onChange={(event) => {
                resetPayments();
                setPaymentMethod(event.target.value as AdminPaymentMethod | "");
              }}
            />
            <Dropdown
              label="Статус платежа"
              value={paymentStatus}
              disabled={isLoadingPayments}
              options={paymentStatusOptions}
              onChange={(event) => {
                resetPayments();
                setPaymentStatus(event.target.value as AdminPaymentRecordStatus | "");
              }}
            />
            <Button type="submit" disabled={isLoadingPayments} leftIcon={isLoadingPayments ? <Spinner /> : undefined}>
              Загрузить платежи
            </Button>
          </form>
        </Card>

        {isLoadingPayments ? <Loader label="Загружаем платежи" /> : null}
        {!isLoadingPayments && paymentsLoadError ? <EmptyState title="Не удалось загрузить платежи" action={<Button type="button" onClick={() => void loadPayments(paymentsPage)}>Повторить</Button>} /> : null}
        {!isLoadingPayments && !paymentsLoadError && !hasRequestedPayments ? <EmptyState title="Загрузите реестр платежей" description="Используются выбранный период и фильтры платежей." /> : null}
        {!isLoadingPayments && !paymentsLoadError && hasRequestedPayments && payments.length === 0 ? <EmptyState title="Платежей не найдено" /> : null}
        {!isLoadingPayments && !paymentsLoadError && payments.length > 0 ? <Card className="manager-panel manager-panel--table"><Table columns={paymentColumns} data={payments} getRowKey={(payment) => payment.id} /></Card> : null}
        {!isLoadingPayments && !paymentsLoadError && paymentsTotal > 0 ? <Pagination page={paymentsPage} pageCount={paymentsPageCount} onPageChange={(page) => void loadPayments(page)} /> : null}
      </section>
    </section>
  );
}
