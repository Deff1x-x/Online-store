using Koz.Application.Auth;

namespace Koz.Api.Auth;

public sealed class AspNetAuthRuntime(IHostEnvironment environment, TimeProvider timeProvider, ILogger<AspNetAuthRuntime> logger) : IAuthRuntime
{
    public DateTimeOffset UtcNow => timeProvider.GetUtcNow();
    public bool UseFixedTestOtp => environment.IsEnvironment("Testing");

    public void LogOtpChallengeCreated()
    {
        logger.LogInformation("OTP challenge created");
    }
}
