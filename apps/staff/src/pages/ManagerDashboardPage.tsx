import { useEffect, useState } from "react";
import { Badge, Body, Card, H1, Loader } from "@koz/ui";
import { useApi } from "@koz/api";

type Analytics = {
  funnel?: Record<string, number | string | undefined>;
  gmv_delivered?: number | string;
  pos_collected?: number | string;
  avg_order_value?: number | string;
  stopped_items?: number | string;
  out_of_stock?: number | string;
  low_stock?: number | string;
};

const formatCurrency = (value: number | string | undefined) =>
  `${Number(value ?? 0).toLocaleString("ru-RU", {
    maximumFractionDigits: 0,
  })} ₸`;

const metricGroups = [
  { key: "new", label: "Новые" },
  { key: "picked", label: "Собраны" },
  { key: "in_delivery", label: "В пути" },
  { key: "delivered", label: "Доставлены" },
  { key: "failed", label: "Невыкуп" },
] as const;

export function ManagerDashboardPage() {
  const { modules } = useApi();
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const result = (await modules.managerApi.getAnalytics()) as unknown as { analytics: Analytics };
        if (!cancelled) setAnalytics(result.analytics ?? {});
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [modules.managerApi]);

  if (isLoading) {
    return <Loader label="Загружаем аналитику" />;
  }

  const moneyMetrics = [
    { label: "GMV", value: formatCurrency(analytics?.gmv_delivered) },
    { label: "POS collected", value: formatCurrency(analytics?.pos_collected) },
    { label: "Average order", value: formatCurrency(analytics?.avg_order_value) },
  ];

  const stockMetrics = [
    { label: "Stopped items", value: Number(analytics?.stopped_items ?? 0) },
    { label: "Out of stock", value: Number(analytics?.out_of_stock ?? 0) },
    { label: "Low stock", value: Number(analytics?.low_stock ?? 0) },
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
          <Badge tone="primary">live</Badge>
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
