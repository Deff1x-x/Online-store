using Xunit;

namespace Koz.Api.Tests;

public sealed class AuthAliasRoutesTests
{
    [Fact]
    public void Auth_controller_exposes_tz_alias_routes()
    {
        var source = File.ReadAllText(Path.Combine(FindRepoRoot(), "backend-dotnet", "src", "Koz.Api", "Controllers", "AuthController.cs"));
        Assert.Contains("[HttpPost(\"register-phone\")]", source, StringComparison.Ordinal);
        Assert.Contains("[HttpPost(\"verify-otp\")]", source, StringComparison.Ordinal);
        Assert.Contains("[HttpPost(\"login-admin\")]", source, StringComparison.Ordinal);
        var routes = File.ReadAllText(Path.Combine(FindRepoRoot(), "src", "modules", "auth", "auth.routes.js"));
        Assert.Contains("register-phone", routes, StringComparison.Ordinal);
        Assert.Contains("verify-otp", routes, StringComparison.Ordinal);
        Assert.Contains("login-admin", routes, StringComparison.Ordinal);
    }

    private static string FindRepoRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            if (File.Exists(Path.Combine(dir.FullName, "package.json"))
                && Directory.Exists(Path.Combine(dir.FullName, "backend-dotnet")))
            {
                return dir.FullName;
            }

            dir = dir.Parent;
        }

        throw new DirectoryNotFoundException("repo root");
    }
}
