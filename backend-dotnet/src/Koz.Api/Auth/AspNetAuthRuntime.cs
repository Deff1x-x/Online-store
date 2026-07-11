using Koz.Application.Auth;

namespace Koz.Api.Auth;

public sealed class AspNetAuthRuntime(IHostEnvironment environment, TimeProvider timeProvider, ILogger<AspNetAuthRuntime> logger) : IAuthRuntime
{
    public DateTimeOffset UtcNow => timeProvider.GetUtcNow();
    public bool IsDevelopment => environment.IsDevelopment();
    public bool UseFixedTestOtp => environment.IsEnvironment("Testing");

    public void LogDevelopmentOtp(string phone, string code)
    {
        logger.LogInformation("SMS OTP for {Phone}: {Code}", phone, code);
    }
}
