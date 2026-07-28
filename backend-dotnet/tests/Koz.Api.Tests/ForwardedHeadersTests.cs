using System.Net;
using System.Text.Json;
using Koz.Api.Configuration;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Xunit;

namespace Koz.Api.Tests;

public sealed class ForwardedHeadersTests
{
    [Fact]
    public void Enabled_without_known_proxy_or_network_fails_fast()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ForwardedHeaders:Enabled"] = "true",
            })
            .Build();
        var env = new HostingEnvironment { EnvironmentName = Environments.Production };
        Assert.Throws<ForwardedProxyConfigurationException>(() => ForwardedProxyOptions.Load(config, env));
    }

    [Fact]
    public void Production_rejects_unrestricted_zero_cidr()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ForwardedHeaders:Enabled"] = "true",
                ["ForwardedHeaders:KnownNetworks:0"] = "0.0.0.0/0",
            })
            .Build();
        var env = new HostingEnvironment { EnvironmentName = Environments.Production };
        Assert.Throws<ForwardedProxyConfigurationException>(() => ForwardedProxyOptions.Load(config, env));
    }

    [Fact]
    public void Disabled_by_default_without_networks()
    {
        var config = new ConfigurationBuilder().Build();
        var env = new HostingEnvironment { EnvironmentName = Environments.Production };
        var options = ForwardedProxyOptions.Load(config, env);
        Assert.False(options.Enabled);
    }

    [Fact]
    public async Task Trusted_proxy_applies_forwarded_proto_and_for()
    {
        await using var factory = new ForwardedApiFactory(mode: ForwardMode.TrustLoopback);
        var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        using var request = new HttpRequestMessage(HttpMethod.Get, "/__test/forwarded");
        request.Headers.TryAddWithoutValidation("X-Forwarded-Proto", "https");
        request.Headers.TryAddWithoutValidation("X-Forwarded-For", "203.0.113.50");
        using var response = await client.SendAsync(request, TestContext.Current.CancellationToken);
        response.EnsureSuccessStatusCode();
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        Assert.Equal("https", json.RootElement.GetProperty("scheme").GetString());
        Assert.Equal("203.0.113.50", json.RootElement.GetProperty("remote_ip").GetString());
    }

    [Fact]
    public async Task When_forwarded_headers_disabled_spoofed_proto_is_ignored()
    {
        await using var factory = new ForwardedApiFactory(mode: ForwardMode.Disabled);
        var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        using var request = new HttpRequestMessage(HttpMethod.Get, "/__test/forwarded");
        request.Headers.TryAddWithoutValidation("X-Forwarded-Proto", "https");
        request.Headers.TryAddWithoutValidation("X-Forwarded-For", "203.0.113.50");
        using var response = await client.SendAsync(request, TestContext.Current.CancellationToken);
        response.EnsureSuccessStatusCode();
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
        Assert.Equal("http", json.RootElement.GetProperty("scheme").GetString());
        Assert.NotEqual("203.0.113.50", json.RootElement.GetProperty("remote_ip").GetString());
    }

    [Fact]
    public void Enabled_known_networks_reject_unrestricted_and_keep_specific_cidr()
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ForwardedHeaders:Enabled"] = "true",
                ["ForwardedHeaders:KnownNetworks:0"] = "10.255.255.0/24",
            })
            .Build();
        var options = ForwardedProxyOptions.Load(config, new HostingEnvironment { EnvironmentName = Environments.Production });
        Assert.True(options.Enabled);
        Assert.Single(options.KnownNetworks);
        Assert.Equal(24, options.KnownNetworks[0].PrefixLength);
        Assert.Throws<ForwardedProxyConfigurationException>(() =>
            ForwardedProxyOptions.Load(
                new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["ForwardedHeaders:Enabled"] = "true",
                    ["ForwardedHeaders:KnownNetworks:0"] = "0.0.0.0/0",
                }).Build(),
                new HostingEnvironment { EnvironmentName = Environments.Production }));
    }

    private enum ForwardMode
    {
        TrustLoopback,
        Disabled,
    }

    private sealed class HostingEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = Environments.Production;
        public string ApplicationName { get; set; } = "test";
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; }
            = new Microsoft.Extensions.FileProviders.NullFileProvider();
    }

    private sealed class ForwardedApiFactory(ForwardMode mode) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Testing");
            builder.UseSetting("Database:ConnectionString",
                "Host=127.0.0.1;Port=5432;Database=koz_forwarded_headers_test;Username=postgres;Password=not-used;Timeout=1");
            builder.UseSetting("Database:ValidateOnStartup", "false");
            builder.UseSetting("Jwt:Secret", "forwarded-headers-jwt-secret-at-least-32-chars");
            builder.UseSetting("Otp:Secret", "forwarded-headers-otp-secret-at-least-32-chars");
            builder.UseSetting("Cors:AllowedOrigins:0", "https://app.example.com");
            builder.UseSetting("Payments:OnlineInitiationEnabled", "false");
            if (mode == ForwardMode.TrustLoopback)
            {
                builder.UseSetting("ForwardedHeaders:Enabled", "true");
                builder.UseSetting("ForwardedHeaders:KnownProxies:0", "127.0.0.1");
                builder.UseSetting("ForwardedHeaders:KnownProxies:1", "::1");
            }
            else
            {
                builder.UseSetting("ForwardedHeaders:Enabled", "false");
            }
        }
    }
}
