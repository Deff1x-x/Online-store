using Xunit;

namespace Koz.Api.Tests;

public sealed class OperatorOrdersMountTests
{
    [Fact]
    public void Operator_orders_legacy_mount_present_in_dotnet_and_node()
    {
        var root = FindRepoRoot();
        var controller = File.ReadAllText(Path.Combine(root, "backend-dotnet", "src", "Koz.Api", "Controllers", "OperatorOrdersController.cs"));
        Assert.Contains("api/operator/orders", controller, StringComparison.Ordinal);
        var appJs = File.ReadAllText(Path.Combine(root, "src", "app.js"));
        Assert.Contains("app.use('/api/operator/orders'", appJs, StringComparison.Ordinal);
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
