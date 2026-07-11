import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Body, Button, Card, EmptyState, H1, Loader } from "@koz/ui";
import { formatMoney, useApi, type ManagerAnalytics } from "@koz/api";

const metricGroups = [
  { key: "new", label: "Новые" },
  { key: "picked", label: "Собраны" },
  { key: "in_delivery", label: "В пути" },
  { key: "delivered", label: "Доставлены" },
  { key: "failed", label: "Невыкуп" },
] as const;

export function ManagerDashboardPage() {
  const { modules } = useApi();
  const [analytics, setAnalytics] = useState<ManagerAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const isMountedRef = useRef(false);
  const requestIdRef = useRef(0);
  const isRequestInFlightRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, []);

  const loadDashboard = useCallback(async () => {
    if (isRequestInFlightRef.current) return;

    const requestId = ++requestIdRef.current;
    isRequestInFlightRef.current = true;
    setIsLoading(true);
    setLoadError(false);

    try {
      const result = await modules.managerApi.getAnalytics();
      if (isMountedRef.current && requestId === requestIdRef.current) {
        setAnalytics(result.analytics);
      }
    } catch {
      if (isMountedRef.current && requestId === requestIdRef.current) {
        setLoadError(true);
      }
    } finally {
      if (requestId === requestIdRef.current) {
        isRequestInFlightRef.current = false;
        if (isMountedRef.current) setIsLoading(false);
      }
    }
  }, [modules.managerApi]);

  useEffect(() => {
    void loadDashboard();
    return () => {
      requestIdRef.current += 1;
      isRequestInFlightRef.current = false;
    };
  }, [loadDashboard]);

  if (isLoading) {
    return <Loader label="Загружаем аналитику" />;
  }

  if (loadError) {
    return (
      <EmptyState
        title="Не удалось загрузить аналитику"
        description="Повторите попытку."
        action={<Button type="button" onClick={() => void loadDashboard()}>Повторить</Button>}
      />
    );
  }

  const moneyMetrics = [
    { label: "GMV", value: formatMoney(analytics?.gmv_delivered) },
    { label: "Получено POS", value: formatMoney(analytics?.pos_collected) },
    { label: "Средний чек", value: formatMoney(analytics?.avg_order_value) },
  ];

  const stockMetrics = [
    { label: "Стоп-позиции", value: Number(analytics?.stopped_items ?? 0) },
    { label: "Нет остатка", value: Number(analytics?.out_of_stock ?? 0) },
    { label: "Мало остатка", value: Number(analytics?.low_stock ?? 0) },
  ];

  return (
    <section className="manager-screen">
      <div className="manager-heading">
        <H1>Дашборд</H1>
        <Body tone="muted">Показатели своей точки за сегодня</Body>
      </div>

      <div className="manager-metric-grid">
        {metricGroups.map((metric) => (
          <Card key={metric.key} className="manager-metric">
            <span>{metric.label}</span>
            <strong>{Number(analytics?.funnel?.[metric.key] ?? 0)}</strong>
          </Card>
        ))}
      </div>

      <div className="manager-metric-grid manager-metric-grid--money">
        {moneyMetrics.map((metric) => (
          <Card key={metric.label} className="manager-metric manager-metric--wide">
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </Card>
        ))}
      </div>

      <Card className="manager-panel">
        <div className="manager-panel__heading">
          <h2>Остатки</h2>
          <Badge tone="primary">Онлайн</Badge>
        </div>
        <div className="manager-stock-summary">
          {stockMetrics.map((metric) => (
            <div key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
            </div>
          ))}
        </div>
      </Card>
    </section>
  );
}
