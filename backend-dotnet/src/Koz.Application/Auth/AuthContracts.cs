using System.Text.Json.Serialization;
using Koz.Domain.Auth;

namespace Koz.Application.Auth;

public sealed record OtpRequest(string? Phone);

public sealed record RegisterCustomerRequest(
    string? Phone,
    string? Code,
    string? Name,
    [property: JsonPropertyName("store_id")] string? StoreId,
    [property: JsonPropertyName("privacy_policy")] bool? PrivacyPolicy,
    [property: JsonPropertyName("terms_of_service")] bool? TermsOfService);

public sealed record CustomerLoginRequest(string? Phone, string? Code);

public sealed record StaffLoginRequest(string? Email, string? Password);

public sealed record RefreshRequest([property: JsonPropertyName("refresh_token")] string? RefreshToken);

public sealed record OtpResponse(string Message, [property: JsonPropertyName("expires_in_seconds")] int ExpiresInSeconds);

public sealed record AuthUserResponse(
    string Id,
    string? Phone,
    string? Email,
    string? Name,
    [property: JsonPropertyName("store_id")] string? StoreId,
    string Role,
    [property: JsonPropertyName("customer_id")] string? CustomerId,
    [property: JsonPropertyName("subscription_status")] string? SubscriptionStatus);

public sealed record StaffUserResponse(string Id, string? Email, string? Name, string Role, [property: JsonPropertyName("store_id")] string? StoreId);

public sealed record CustomerAuthResponse(string Token, [property: JsonPropertyName("refresh_token")] string RefreshToken, AuthUserResponse User);

public sealed record StaffAuthResponse(string Token, StaffUserResponse User);

public sealed record AuthenticatedUser(
    string Id,
    UserRole Role,
    string? StoreId,
    string? CustomerId,
    string? Email,
    string? Phone,
    string? Name,
    string? SubscriptionStatus,
    string? PasswordHash = null);

public sealed record RequestContext(string? IpAddress, string? UserAgent);

public sealed class AuthContractException(int statusCode, string message, string code) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
    public string Code { get; } = code;
}
