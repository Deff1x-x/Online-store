using Koz.Application.Auth;
using Koz.Domain.Auth;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;

namespace Koz.Api.Auth;

public sealed class JwtAccessTokenIssuer(JwtOptions options, TimeProvider timeProvider) : IAccessTokenIssuer
{
    public string Issue(AuthenticatedUser user)
    {
        var issuedAt = timeProvider.GetUtcNow();
        var payload = new JwtPayload
        {
            { "id", user.Id },
            { "role", user.Role.ToContractValue() },
            { "iat", issuedAt.ToUnixTimeSeconds() },
            { "exp", issuedAt.Add(options.AccessTokenLifetime).ToUnixTimeSeconds() },
        };

        AddIfPresent(payload, "store_id", user.StoreId);
        AddIfPresent(payload, "customer_id", user.CustomerId);
        AddIfPresent(payload, "email", user.Email);
        AddIfPresent(payload, "phone", user.Phone);

        var credentials = new SigningCredentials(new SymmetricSecurityKey(options.SigningKey), SecurityAlgorithms.HmacSha256);
        return new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken(new JwtHeader(credentials), payload));
    }

    private static void AddIfPresent(JwtPayload payload, string name, string? value)
    {
        if (!string.IsNullOrEmpty(value))
        {
            payload.Add(name, value);
        }
    }
}
