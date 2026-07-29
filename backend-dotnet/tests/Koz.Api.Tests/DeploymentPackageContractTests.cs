using Xunit;

namespace Koz.Api.Tests;

/// <summary>
/// Static contract checks for the approved VPS Docker Compose + Nginx package.
/// Does not require Docker daemon.
/// </summary>
public sealed class DeploymentPackageContractTests
{
    private static string RepoRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            if (File.Exists(Path.Combine(dir.FullName, "package.json"))
                && Directory.Exists(Path.Combine(dir.FullName, "deploy", "vps")))
            {
                return dir.FullName;
            }

            dir = dir.Parent;
        }

        throw new DirectoryNotFoundException("Could not locate repository root with deploy/vps.");
    }

    private static string Read(params string[] parts) =>
        File.ReadAllText(Path.Combine(new[] { RepoRoot() }.Concat(parts).ToArray()));

    [Fact]
    public void Compose_does_not_publish_backend_or_database_ports()
    {
        var compose = Read("deploy", "vps", "docker-compose.yml");
        Assert.Contains("expose:", compose, StringComparison.Ordinal);
        Assert.Contains("\"8080\"", compose, StringComparison.Ordinal);
        Assert.Contains("\"3000\"", compose, StringComparison.Ordinal);
        Assert.DoesNotContain("8080:8080", compose, StringComparison.Ordinal);
        Assert.DoesNotContain("3000:3000", compose, StringComparison.Ordinal);
        Assert.DoesNotContain("5432:5432", compose, StringComparison.Ordinal);
        Assert.Contains("ports:", compose, StringComparison.Ordinal);
        Assert.Contains("\"80:80\"", compose, StringComparison.Ordinal);
        Assert.Contains("\"443:443\"", compose, StringComparison.Ordinal);
    }

    [Fact]
    public void Compose_uses_healthchecks_restart_and_stop_grace_for_dotnet()
    {
        var compose = Read("deploy", "vps", "docker-compose.yml");
        Assert.Contains("dotnet-api:", compose, StringComparison.Ordinal);
        Assert.Contains("healthcheck:", compose, StringComparison.Ordinal);
        Assert.Contains("/health/ready", compose, StringComparison.Ordinal);
        Assert.Contains("stop_grace_period: 35s", compose, StringComparison.Ordinal);
        Assert.Contains("restart: unless-stopped", compose, StringComparison.Ordinal);
        Assert.Contains("ASPNETCORE_ENVIRONMENT: Production", compose, StringComparison.Ordinal);
        Assert.DoesNotContain("DATABASE_PASSWORD=", compose, StringComparison.Ordinal);
        Assert.DoesNotContain("JWT_SECRET=", compose, StringComparison.Ordinal);
    }

    [Fact]
    public void Optional_postgres_compose_does_not_publish_5432()
    {
        var compose = Read("deploy", "vps", "docker-compose.postgres.yml");
        Assert.Contains("profiles: [\"postgres\"]", compose, StringComparison.Ordinal);
        Assert.DoesNotContain("5432:5432", compose, StringComparison.Ordinal);
        Assert.Contains("postgres_data", compose, StringComparison.Ordinal);
    }

    [Fact]
    public void Dockerfile_runs_as_non_root_and_exposes_8080()
    {
        var docker = Read("backend-dotnet", "Dockerfile");
        Assert.Contains("USER koz", docker, StringComparison.Ordinal);
        Assert.Contains("EXPOSE 8080", docker, StringComparison.Ordinal);
        Assert.Contains("uid 10001", docker, StringComparison.Ordinal);
    }

    [Fact]
    public void Nginx_has_dotnet_and_node_upstreams_and_active_switch()
    {
        var upstreams = Read("deploy", "vps", "nginx", "conf.d", "upstreams.conf");
        var active = Read("deploy", "vps", "nginx", "conf.d", "active-upstream.conf");
        var site = Read("deploy", "vps", "nginx", "conf.d", "koz-api.conf");
        Assert.Contains("upstream koz_dotnet", upstreams, StringComparison.Ordinal);
        Assert.Contains("upstream koz_node", upstreams, StringComparison.Ordinal);
        Assert.Contains("upstream koz_active", active, StringComparison.Ordinal);
        Assert.Contains("dotnet-api:8080", active, StringComparison.Ordinal);
        Assert.Contains("proxy_pass http://koz_active", site, StringComparison.Ordinal);
        Assert.Contains("X-Forwarded-Proto", site, StringComparison.Ordinal);
        Assert.Contains("X-Request-ID", site, StringComparison.Ordinal);
    }

    [Fact]
    public void Env_template_enables_payment_placeholder_and_requires_distinct_secrets()
    {
        var env = Read("deploy", "vps", ".env.production.example");
        Assert.Contains("ASPNETCORE_ENVIRONMENT=Production", env, StringComparison.Ordinal);
        Assert.Contains("PAYMENTS_ONLINE_INITIATION_ENABLED=true", env, StringComparison.Ordinal);
        Assert.Contains("JWT_SECRET=", env, StringComparison.Ordinal);
        Assert.Contains("OTP_SECRET=", env, StringComparison.Ordinal);
        Assert.Contains("JWT_SECRET must differ from OTP_SECRET", env, StringComparison.Ordinal);
        Assert.Contains("ForwardedHeaders__Enabled=true", env, StringComparison.Ordinal);
        Assert.Contains("Cors__AllowedOrigins__0=", env, StringComparison.Ordinal);
        Assert.DoesNotContain("kaspi.placeholder", env, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Migration_script_is_ordered_and_non_destructive()
    {
        var script = Read("scripts", "vps", "migrate-production.sh");
        Assert.Contains("001_standardize_user_roles.sql", script, StringComparison.Ordinal);
        Assert.Contains("002_expand_core_schema.sql", script, StringComparison.Ordinal);
        Assert.Contains("003_otp_challenges.sql", script, StringComparison.Ordinal);
        Assert.DoesNotContain("DROP TABLE otp_challenges", script, StringComparison.Ordinal);
        Assert.DoesNotContain("down migration", script, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("BACKUP_CONFIRMED", script, StringComparison.Ordinal);
    }

    [Fact]
    public void Rollback_script_switches_nginx_without_schema_changes()
    {
        var script = Read("scripts", "vps", "rollback-to-node.sh");
        Assert.Contains("nginx-switch-node.sh", script, StringComparison.Ordinal);
        Assert.DoesNotContain("DROP TABLE", script, StringComparison.Ordinal);
        Assert.DoesNotContain("psql", script, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("otp", script, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Gitignore_excludes_env_files()
    {
        var gitignore = Read(".gitignore");
        Assert.Contains(".env", gitignore, StringComparison.Ordinal);
    }
}
