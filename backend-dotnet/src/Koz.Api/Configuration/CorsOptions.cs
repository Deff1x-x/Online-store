using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;

namespace Koz.Api.Configuration;

public sealed class CorsOptions
{
    private CorsOptions(IReadOnlyList<string> allowedOrigins) => AllowedOrigins = allowedOrigins;

    public IReadOnlyList<string> AllowedOrigins { get; }

    public static CorsOptions Load(IConfiguration configuration, IHostEnvironment environment)
    {
        var configured = configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
        var origins = new List<string>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var raw in configured)
        {
            if (string.IsNullOrWhiteSpace(raw))
            {
                continue;
            }

            var origin = raw.Trim().TrimEnd('/');
            if (origin == "*")
            {
                throw new CorsConfigurationException("CORS wildcard origin '*' is not allowed.");
            }

            if (!IsValidOrigin(origin))
            {
                throw new CorsConfigurationException($"CORS origin is invalid: {raw.Trim()}");
            }

            if (seen.Add(origin))
            {
                origins.Add(origin);
            }
        }

        if (environment.IsProduction() && origins.Count == 0)
        {
            throw new CorsConfigurationException("Cors:AllowedOrigins must contain at least one origin in Production.");
        }

        return new CorsOptions(origins);
    }

    private static bool IsValidOrigin(string origin)
    {
        if (!Uri.TryCreate(origin, UriKind.Absolute, out var uri))
        {
            return false;
        }

        if (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps)
        {
            return false;
        }

        if (!string.IsNullOrEmpty(uri.UserInfo)
            || !string.IsNullOrEmpty(uri.Query)
            || !string.IsNullOrEmpty(uri.Fragment)
            || !string.IsNullOrEmpty(uri.AbsolutePath.Trim('/')))
        {
            return false;
        }

        return true;
    }
}

public sealed class CorsConfigurationException(string message) : Exception(message);
