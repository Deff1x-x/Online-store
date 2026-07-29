using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;

namespace Koz.Api.Configuration;

/// <summary>
/// Online payment initiation gate. TZ А5 requires a <b>placeholder</b> provider until an acquiring
/// contract exists — initiation defaults to <c>enabled</c> in all environments (Node parity).
/// Explicit <c>false</c> remains an operational kill-switch (returns 503).
/// </summary>
public sealed class PaymentsOptions
{
    private PaymentsOptions(bool onlineInitiationEnabled) => OnlineInitiationEnabled = onlineInitiationEnabled;

    public bool OnlineInitiationEnabled { get; }

    public static PaymentsOptions Load(IConfiguration configuration, IHostEnvironment environment)
    {
        _ = environment;

        var raw = Environment.GetEnvironmentVariable("PAYMENTS_ONLINE_INITIATION_ENABLED")?.Trim()
            ?? configuration["Payments:OnlineInitiationEnabled"]?.Trim();

        if (!string.IsNullOrEmpty(raw))
        {
            if (!bool.TryParse(raw, out var configured))
            {
                throw new PaymentsConfigurationException(
                    "PAYMENTS_ONLINE_INITIATION_ENABLED / Payments:OnlineInitiationEnabled must be true or false.");
            }

            return new PaymentsOptions(configured);
        }

        // TZ: placeholder initiation until acquiring contract — default on.
        return new PaymentsOptions(onlineInitiationEnabled: true);
    }
}

public sealed class PaymentsConfigurationException(string message) : Exception(message);
