using System.Security.Cryptography;
using System.Text;
using Koz.Application.Auth;
using Microsoft.Extensions.Hosting;

namespace Koz.Api.Auth;

public sealed class OtpOptions
{
    public const string DevelopmentSecret = "development-only-otp-hmac-secret-do-not-use-in-production";

    private OtpOptions(string secret) => Secret = secret;

    public string Secret { get; }
    public byte[] Key => Encoding.UTF8.GetBytes(Secret);

    public static OtpOptions Load(IConfiguration configuration, IHostEnvironment environment, string jwtSecret)
    {
        var secret = Environment.GetEnvironmentVariable("OTP_SECRET")?.Trim()
            ?? configuration["Otp:Secret"]?.Trim();

        if (string.IsNullOrEmpty(secret))
        {
            if (!environment.IsDevelopment())
            {
                throw InvalidSecret();
            }

            secret = DevelopmentSecret;
        }

        if (secret.Length < 32
            || secret == "change_this_secret"
            || secret == jwtSecret
            || (secret == DevelopmentSecret && !environment.IsDevelopment()))
        {
            throw InvalidSecret();
        }

        return new OtpOptions(secret);
    }

    private static AuthContractException InvalidSecret() =>
        new(500, "OTP_SECRET must be configured with at least 32 characters and must differ from JWT_SECRET", "otp_secret_invalid");
}

public sealed class HmacOtpCodeHasher(OtpOptions options) : IOtpCodeHasher
{
    public string Hash(string phone, string code)
    {
        var payload = Encoding.UTF8.GetBytes(phone + "\n" + code);
        return Convert.ToHexString(HMACSHA256.HashData(options.Key, payload)).ToLowerInvariant();
    }
}
