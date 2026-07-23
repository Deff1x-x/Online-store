using System.Collections.Concurrent;
using System.Diagnostics;
using System.Globalization;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

namespace Koz.LoadHarness;

/// <summary>
/// Minimal in-repo load harness for BACKEND-LOAD-AND-RESILIENCE-AUDIT.
/// Profiles: smoke | normal | peak | stress | soak
/// </summary>
public static class Program
{
    private const string StoreId = "11111111-1111-1111-1111-111111111111";

    public static async Task<int> Main(string[] args)
    {
        var profile = args.ElementAtOrDefault(0)?.ToLowerInvariant() ?? "smoke";
        var baseUrl = Environment.GetEnvironmentVariable("KOZ_LOAD_BASE_URL") ?? "http://localhost:5000";
        var customerToken = Environment.GetEnvironmentVariable("KOZ_LOAD_CUSTOMER_TOKEN");
        var managerToken = Environment.GetEnvironmentVariable("KOZ_LOAD_MANAGER_TOKEN");
        var adminToken = Environment.GetEnvironmentVariable("KOZ_LOAD_ADMIN_CUSTOMERS_TOKEN");
        var addressId = Environment.GetEnvironmentVariable("KOZ_LOAD_ADDRESS_ID");
        var orderProductId = Environment.GetEnvironmentVariable("KOZ_LOAD_PRODUCT_ID") ?? "33333333-3333-3333-3333-333333333333";

        var settings = profile switch
        {
            "smoke" => new Profile(5, TimeSpan.FromSeconds(15), 2),
            "normal" => new Profile(20, TimeSpan.FromMinutes(3), 8),
            "peak" => new Profile(60, TimeSpan.FromSeconds(45), 25),
            "stress" => new Profile(120, TimeSpan.FromMinutes(2), 40),
            "soak" => new Profile(15, TimeSpan.FromMinutes(10), 6),
            _ => throw new ArgumentException($"Unknown profile '{profile}'. Use smoke|normal|peak|stress|soak."),
        };
        if (int.TryParse(Environment.GetEnvironmentVariable("KOZ_LOAD_DURATION_SEC"), out var durationSec) && durationSec > 0)
        {
            settings = settings with { Duration = TimeSpan.FromSeconds(durationSec) };
        }

        using var client = new HttpClient { BaseAddress = new Uri(baseUrl.TrimEnd('/') + "/"), Timeout = TimeSpan.FromSeconds(60) };
        Console.WriteLine($"Load harness profile={profile} base={baseUrl} duration={settings.Duration} workers={settings.Workers} targetRps={settings.TargetRps}");
        Console.WriteLine("Audit thresholds are exploratory and are NOT a product SLA.");
        CultureInfo.CurrentCulture = CultureInfo.InvariantCulture;
        CultureInfo.CurrentUICulture = CultureInfo.InvariantCulture;

        var scenarios = BuildScenarios(customerToken, managerToken, adminToken, addressId, orderProductId);
        var metrics = new ConcurrentDictionary<string, ScenarioMetrics>(StringComparer.Ordinal);
        foreach (var scenario in scenarios)
        {
            metrics[scenario.Name] = new ScenarioMetrics();
        }

        using var cts = new CancellationTokenSource(settings.Duration);
        var workers = Enumerable.Range(0, settings.Workers).Select(worker => RunWorkerAsync(client, scenarios, metrics, settings, worker, cts.Token));
        var started = Stopwatch.StartNew();
        try
        {
            await Task.WhenAll(workers);
        }
        catch (OperationCanceledException) when (cts.IsCancellationRequested)
        {
        }

        started.Stop();
        WriteReport(profile, started.Elapsed, metrics);
        return 0;
    }

    private static List<Scenario> BuildScenarios(string? customerToken, string? managerToken, string? adminToken, string? addressId, string productId)
    {
        var list = new List<Scenario>
        {
            new("health", HttpMethod.Get, "api/health", null, null),
            new("ready", HttpMethod.Get, "health/ready", null, null),
            new("otp", HttpMethod.Post, "api/auth/otp", null, () => JsonContent.Create(new { phone = ("h" + Guid.NewGuid().ToString("N"))[..16] })),
            new("catalog", HttpMethod.Get, $"api/products/store/{StoreId}", null, null),
        };

        if (!string.IsNullOrWhiteSpace(customerToken))
        {
            list.Add(new("profile", HttpMethod.Get, "api/my-profile", customerToken, null));
            list.Add(new("my-orders", HttpMethod.Get, "api/my-orders", customerToken, null));
            if (!string.IsNullOrWhiteSpace(addressId))
            {
                list.Add(new("order-create", HttpMethod.Post, "api/orders", customerToken, () => JsonContent.Create(new
                {
                    payment_method = "online",
                    delivery_address_id = addressId,
                    items = new[] { new { product_id = productId, quantity = 1m } },
                })));
            }
        }

        if (!string.IsNullOrWhiteSpace(managerToken))
        {
            list.Add(new("manager-inventory", HttpMethod.Get, "api/my-store/inventory", managerToken, null));
            list.Add(new("manager-analytics", HttpMethod.Get, "api/my-store/analytics", managerToken, null));
        }

        if (!string.IsNullOrWhiteSpace(adminToken))
        {
            list.Add(new("admin-customers", HttpMethod.Get, "api/admin/customers/customers?limit=20", adminToken, null));
        }

        return list;
    }

    private static async Task RunWorkerAsync(
        HttpClient client,
        IReadOnlyList<Scenario> scenarios,
        ConcurrentDictionary<string, ScenarioMetrics> metrics,
        Profile profile,
        int worker,
        CancellationToken cancellationToken)
    {
        var delay = TimeSpan.FromMilliseconds(Math.Max(1, 1000.0 * profile.Workers / Math.Max(1, profile.TargetRps)));
        var index = worker;
        while (!cancellationToken.IsCancellationRequested)
        {
            var scenario = scenarios[index % scenarios.Count];
            index++;
            var metric = metrics[scenario.Name];
            var sw = Stopwatch.StartNew();
            try
            {
                using var request = new HttpRequestMessage(scenario.Method, scenario.Path);
                if (scenario.Token is not null)
                {
                    request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", scenario.Token);
                }

                if (scenario.BodyFactory is not null)
                {
                    request.Content = scenario.BodyFactory();
                }

                using var response = await client.SendAsync(request, cancellationToken);
                sw.Stop();
                metric.Record((int)response.StatusCode, sw.Elapsed.TotalMilliseconds, cancelled: false);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                break;
            }
            catch (OperationCanceledException)
            {
                sw.Stop();
                metric.Record(0, sw.Elapsed.TotalMilliseconds, cancelled: true);
            }
            catch (Exception)
            {
                sw.Stop();
                metric.Record(0, sw.Elapsed.TotalMilliseconds, cancelled: false, transportError: true);
            }

            try
            {
                await Task.Delay(delay, cancellationToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private static void WriteReport(string profile, TimeSpan elapsed, ConcurrentDictionary<string, ScenarioMetrics> metrics)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"# Load harness report ({profile})");
        sb.AppendLine($"elapsed_sec={elapsed.TotalSeconds.ToString("F1", CultureInfo.InvariantCulture)}");
        sb.AppendLine("| scenario | rps | ok | fail | timeout/cancel | p50 | p95 | p99 | max | statuses |");
        sb.AppendLine("|---|---:|---:|---:|---:|---:|---:|---:|---:|---|");
        foreach (var (name, metric) in metrics.OrderBy(x => x.Key, StringComparer.Ordinal))
        {
            var snap = metric.Snapshot(elapsed);
            sb.AppendLine($"| {name} | {snap.Rps:F1} | {snap.Ok} | {snap.Fail} | {snap.Cancelled} | {snap.P50:F0} | {snap.P95:F0} | {snap.P99:F0} | {snap.Max:F0} | {snap.Statuses} |");
        }

        Console.WriteLine(sb.ToString());
        var outDir = Path.Combine("artifacts", "load");
        Directory.CreateDirectory(outDir);
        var path = Path.Combine(outDir, $"load-{profile}-{DateTimeOffset.UtcNow:yyyyMMddHHmmss}.md");
        File.WriteAllText(path, sb.ToString());
        Console.WriteLine($"Wrote {path}");
    }

    private sealed record Profile(int Workers, TimeSpan Duration, int TargetRps);
    private sealed record Scenario(string Name, HttpMethod Method, string Path, string? Token, Func<HttpContent>? BodyFactory);

    private sealed class ScenarioMetrics
    {
        private readonly object gate = new();
        private readonly List<double> latencies = [];
        private readonly Dictionary<int, int> statuses = [];
        private int ok;
        private int fail;
        private int cancelled;

        public void Record(int status, double ms, bool cancelled, bool transportError = false)
        {
            lock (gate)
            {
                latencies.Add(ms);
                if (cancelled)
                {
                    this.cancelled++;
                    return;
                }

                if (transportError || status == 0 || status >= 500)
                {
                    fail++;
                }
                else if (status >= 200 && status < 400)
                {
                    ok++;
                }
                else
                {
                    fail++;
                }

                statuses[status] = statuses.TryGetValue(status, out var count) ? count + 1 : 1;
            }
        }

        public Snapshot Snapshot(TimeSpan elapsed)
        {
            lock (gate)
            {
                var sorted = latencies.OrderBy(x => x).ToArray();
                double Pct(double p) => sorted.Length == 0 ? 0 : sorted[Math.Clamp((int)Math.Ceiling(p / 100.0 * sorted.Length) - 1, 0, sorted.Length - 1)];
                var total = ok + fail + cancelled;
                var rps = elapsed.TotalSeconds <= 0 ? 0 : total / elapsed.TotalSeconds;
                var statusText = string.Join(' ', statuses.OrderBy(x => x.Key).Select(x => $"{x.Key}:{x.Value}"));
                return new Snapshot(rps, ok, fail, cancelled, Pct(50), Pct(95), Pct(99), sorted.LastOrDefault(), statusText);
            }
        }
    }

    private sealed record Snapshot(double Rps, int Ok, int Fail, int Cancelled, double P50, double P95, double P99, double Max, string Statuses);
}
