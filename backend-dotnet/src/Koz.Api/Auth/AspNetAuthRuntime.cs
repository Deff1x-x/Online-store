using Koz.Application.Auth;

namespace Koz.Api.Auth;

public sealed class AspNetAuthRuntime(IHostEnvironment environment, TimeProvider timeProvider, ILogger<AspNetAuthRuntime> logger) : IAuthRuntime
{
    public DateTimeOffset UtcNow => timeProvider.GetUtcNow();
    // Development + Testing: fixed local OTP `1234` (never logged as plaintext).
    // Production and other environments keep random codes with no console delivery.
    public bool UseFixedTestOtp =>
        environment.IsDevelopment() || environment.IsEnvironment("Testing");

    public void LogOtpChallengeCreated()
    {
        logger.LogInformation("OTP challenge created");
    }
}
