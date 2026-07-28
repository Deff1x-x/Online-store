using System.Net;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using IPNetwork = System.Net.IPNetwork;

namespace Koz.Api.Configuration;

/// <summary>
/// Production-safe forwarded headers behind a trusted reverse proxy (Nginx).
/// Disabled unless explicitly enabled with at least one known network or proxy.
/// </summary>
public sealed class ForwardedProxyOptions
{
    private ForwardedProxyOptions(
        bool enabled,
        IReadOnlyList<IPNetwork> knownNetworks,
        IReadOnlyList<IPAddress> knownProxies)
    {
        Enabled = enabled;
        KnownNetworks = knownNetworks;
        KnownProxies = knownProxies;
    }

    public bool Enabled { get; }
    public IReadOnlyList<IPNetwork> KnownNetworks { get; }
    public IReadOnlyList<IPAddress> KnownProxies { get; }

    public static ForwardedProxyOptions Load(IConfiguration configuration, IHostEnvironment environment)
    {
        var enabled = configuration.GetValue("ForwardedHeaders:Enabled", false)
            || string.Equals(Environment.GetEnvironmentVariable("ForwardedHeaders__Enabled"), "true", StringComparison.OrdinalIgnoreCase);

        var networks = new List<IPNetwork>();
        var proxies = new List<IPAddress>();

        foreach (var raw in configuration.GetSection("ForwardedHeaders:KnownNetworks").Get<string[]>() ?? [])
        {
            if (string.IsNullOrWhiteSpace(raw))
            {
                continue;
            }

            if (!TryParseCidr(raw.Trim(), out var network))
            {
                throw new ForwardedProxyConfigurationException(
                    $"ForwardedHeaders:KnownNetworks entry is invalid CIDR: {raw.Trim()}");
            }

            networks.Add(network);
        }

        foreach (var raw in configuration.GetSection("ForwardedHeaders:KnownProxies").Get<string[]>() ?? [])
        {
            if (string.IsNullOrWhiteSpace(raw))
            {
                continue;
            }

            if (!IPAddress.TryParse(raw.Trim(), out var address))
            {
                throw new ForwardedProxyConfigurationException(
                    $"ForwardedHeaders:KnownProxies entry is invalid IP: {raw.Trim()}");
            }

            proxies.Add(address);
        }

        if (!enabled)
        {
            return new ForwardedProxyOptions(false, networks, proxies);
        }

        if (networks.Count == 0 && proxies.Count == 0)
        {
            throw new ForwardedProxyConfigurationException(
                "ForwardedHeaders:Enabled requires at least one KnownNetworks CIDR or KnownProxies IP. Refusing to trust all proxies.");
        }

        if (environment.IsProduction()
            && networks.Exists(static n => n.PrefixLength == 0))
        {
            throw new ForwardedProxyConfigurationException(
                "ForwardedHeaders must not trust 0.0.0.0/0 in Production.");
        }

        return new ForwardedProxyOptions(true, networks, proxies);
    }

    public void Apply(ForwardedHeadersOptions options)
    {
        options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto | ForwardedHeaders.XForwardedHost;
        options.KnownIPNetworks.Clear();
        options.KnownProxies.Clear();
        foreach (var network in KnownNetworks)
        {
            options.KnownIPNetworks.Add(network);
        }

        foreach (var proxy in KnownProxies)
        {
            options.KnownProxies.Add(proxy);
        }

        // Only one hop expected (edge Nginx → app).
        options.ForwardLimit = 1;
        options.RequireHeaderSymmetry = false;
    }

    private static bool TryParseCidr(string cidr, out IPNetwork network)
    {
        network = default!;
        var parts = cidr.Split('/', 2, StringSplitOptions.TrimEntries);
        if (parts.Length != 2 || !IPAddress.TryParse(parts[0], out var prefix) || !int.TryParse(parts[1], out var length))
        {
            return false;
        }

        if (length < 0 || length > (prefix.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork ? 32 : 128))
        {
            return false;
        }

        network = new IPNetwork(prefix, length);
        return true;
    }
}

public sealed class ForwardedProxyConfigurationException(string message) : Exception(message);
