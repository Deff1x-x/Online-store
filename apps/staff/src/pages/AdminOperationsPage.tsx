import { useRef, useState } from "react";
import { Body, Button, Card, EmptyState, H1, H2, Loader, Spinner, TextField } from "@koz/ui";
import { formatMoney, useApi, useToast, type AdminStoreReport } from "@koz/api";

export default function AdminOperationsPage() {
  const { modules } = useApi();
  const { showToast } = useToast();
  const requestIdRef = useRef(0);
  const [storeId, setStoreId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [report, setReport] = useState<AdminStoreReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [hasRequested, setHasRequested] = useState(false);

  const resetReport = () => {
    requestIdRef.current += 1;
    setReport(null);
    setIsLoading(false);
    setLoadError(false);
    setHasRequested(false);
  };

  const loadReport = async () => {
    const normalizedStoreId = storeId.trim();

    if (!normalizedStoreId) {
      showToast({ message: "Укажите ID точки.", tone: "warning" });
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setHasRequested(true);
    setIsLoading(true);
    setLoadError(false);
    setReport(null);

    try {
      const response = await modules.adminOperationsApi.getStoreReport(normalizedStoreId, {
        ...(dateFrom ? { date_from: dateFrom } : {}),
        ...(dateTo ? { date_to: dateTo } : {}),
      });

      if (requestId === requestIdRef.current) {
        setReport(response.report);
      }
    } catch {
      if (requestId === requestIdRef.current) {
        setLoadError(true);
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  };

  const hasOrders = report !== null && report.orders.totals > 0;

  return (
    <section className="manager-screen">
      <div className="manager-heading">
        <H1>Отчёты</H1>
        <Body tone="muted">Показатели точки по заказам и подписчикам</Body>
      </div>

      <Card className="manager-panel">
        <form
          className="admin-store-form"
          onSubmit={(event) => {
            event.preventDefault();
            void loadReport();
          }}
        >
          <TextField
            label="ID точки"
            value={storeId}
            disabled={isLoading}
            onChange={(event) => {
              resetReport();
              setStoreId(event.target.value);
            }}
          />
          <TextField
            label="Дата с"
            type="date"
            value={dateFrom}
            disabled={isLoading}
            onChange={(event) => {
              resetReport();
              setDateFrom(event.target.value);
            }}
          />
          <TextField
            label="Дата по"
            type="date"
            value={dateTo}
            disabled={isLoading}
            onChange={(event) => {
              resetReport();
              setDateTo(event.target.value);
            }}
          />
          <Button type="submit" disabled={isLoading} leftIcon={isLoading ? <Spinner /> : undefined}>
            Загрузить отчёт
          </Button>
        </form>
      </Card>

      {isLoading ? <Loader label="Загружаем отчёт" /> : null}
      {!isLoading && loadError ? (
        <EmptyState
          title="Не удалось загрузить отчёт"
          description="Проверьте ID точки и повторите попытку."
          action={<Button type="button" onClick={() => void loadReport()}>Повторить</Button>}
        />
      ) : null}
      {!isLoading && !loadError && !hasRequested ? (
        <EmptyState title="Укажите ID точки" description="Список точек недоступен роли операций, поэтому используйте идентификатор точки." />
      ) : null}
      {!isLoading && !loadError && report && !hasOrders ? (
        <EmptyState title="За выбранный период операций нет" description={`Точка: ${report.store.name}.`} />
      ) : null}
      {!isLoading && !loadError && report && hasOrders ? (
        <>
          <div className="manager-heading">
            <H2>{report.store.name}</H2>
            <Body tone="muted">{report.store.address}</Body>
          </div>
          <div className="manager-metric-grid manager-metric-grid--money">
            <Card className="manager-metric manager-metric--wide">
              <span>GMV</span>
              <strong>{formatMoney(report.orders.gmv)}</strong>
            </Card>
            <Card className="manager-metric manager-metric--wide">
              <span>Онлайн</span>
              <strong>{formatMoney(report.orders.online_part)}</strong>
            </Card>
            <Card className="manager-metric manager-metric--wide">
              <span>POS</span>
              <strong>{formatMoney(report.orders.pos_part)}</strong>
            </Card>
            <Card className="manager-metric manager-metric--wide">
              <span>Средний чек</span>
              <strong>{formatMoney(report.orders.avg)}</strong>
            </Card>
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
  );
}
