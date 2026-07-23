using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;

namespace Koz.Api.Configuration;

/// <summary>
/// Online payment initiation gate. Production defaults to disabled until a real provider
/// contract exists (release condition R1). Non-production defaults to enabled for Node parity tests.
/// </summary>
public sealed class PaymentsOptions
{
    private PaymentsOptions(bool onlineInitiationEnabled) => OnlineInitiationEnabled = onlineInitiationEnabled;

    public bool OnlineInitiationEnabled { get; }

    public static PaymentsOptions Load(IConfiguration configuration, IHostEnvironment environment)
    {
        var raw = Environment.GetEnvironmentVariable("PAYMENTS_ONLINE_INITIATION_ENABLED")?.Trim()
            ?? configuration["Payments:OnlineInitiationEnabled"]?.Trim();

        if (!string.IsNullOrEmpty(raw))
        {
            if (!bool.TryParse(raw, out var configured))
            {
                throw new PaymentsConfigurationException(
                    "PAYMENTS_ONLINE_INITIATION_ENABLED / Payments:OnlineInitiationEnabled must be true or false.");
            }

            if (environment.IsProduction() && configured)
            {
                // Refuse enabling placeholder initiation in Production without an approved provider.
                throw new PaymentsConfigurationException(
                    "Online payment initiation cannot be enabled in Production until a real payment provider contract is configured.");
            }

            return new PaymentsOptions(configured);
        }

        return new PaymentsOptions(onlineInitiationEnabled: !environment.IsProduction());
    }
}

public sealed class PaymentsConfigurationException(string message) : Exception(message);
