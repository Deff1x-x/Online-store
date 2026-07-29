using Xunit;

namespace Koz.Api.Tests;

public sealed class InventoryReceiveAliasTests
{
    [Fact]
    public void Incoming_and_receive_routes_both_present()
    {
        var root = FindRepoRoot();
        var controller = File.ReadAllText(Path.Combine(root, "backend-dotnet", "src", "Koz.Api", "Controllers", "ManagerInventoryController.cs"));
        Assert.Contains("inventory/{productId}/incoming", controller, StringComparison.Ordinal);
        Assert.Contains("inventory/{productId}/receive", controller, StringComparison.Ordinal);
        var routes = File.ReadAllText(Path.Combine(root, "src", "modules", "my-store", "my-store.routes.js"));
        Assert.Contains("/incoming", routes, StringComparison.Ordinal);
        Assert.Contains("/receive", routes, StringComparison.Ordinal);
        var api = File.ReadAllText(Path.Combine(root, "packages", "api", "src", "modules", "manager-api.ts"));
        Assert.Contains("/receive", api, StringComparison.Ordinal);
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
