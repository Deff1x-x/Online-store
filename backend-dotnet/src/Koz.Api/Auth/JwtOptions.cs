using System.Text;
using Koz.Application.Auth;

namespace Koz.Api.Auth;

public sealed class JwtOptions
{
    public const string DevelopmentSecret = "development-only-jwt-secret-do-not-use-in-production";

    private JwtOptions(string secret) => Secret = secret;

    public string Secret { get; }
    public byte[] SigningKey => Encoding.UTF8.GetBytes(Secret);
    public TimeSpan AccessTokenLifetime => TimeSpan.FromMinutes(15);

    public static JwtOptions Load(IConfiguration configuration, IHostEnvironment environment)
    {
        var secret = Environment.GetEnvironmentVariable("JWT_SECRET")?.Trim()
            ?? configuration["Jwt:Secret"]?.Trim()
            ?? DevelopmentSecret;

        if (environment.IsProduction() &&
            (secret.Length < 32 || secret == "change_this_secret" || secret == DevelopmentSecret))
        {
            throw new AuthContractException(500, "JWT_SECRET must be configured with at least 32 non-development characters in production", "jwt_secret_invalid");
        }

        return new JwtOptions(secret);
    }
}
