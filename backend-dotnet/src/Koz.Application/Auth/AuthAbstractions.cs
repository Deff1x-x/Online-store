namespace Koz.Application.Auth;

public interface IAuthRepository
{
    Task<RegistrationResult> CreateCustomerRegistrationAsync(CustomerRegistration registration, CancellationToken cancellationToken);
    Task<AuthenticatedUser?> FindCustomerByPhoneAsync(string phone, CancellationToken cancellationToken);
    Task<AuthenticatedUser?> FindStaffByEmailAsync(string email, CancellationToken cancellationToken);
    Task CreateUserSessionAsync(UserSession session, CancellationToken cancellationToken);
    Task<AuthenticatedUser?> RotateRefreshSessionAsync(RefreshSessionRotation rotation, CancellationToken cancellationToken);
}

public interface IPasswordVerifier
{
    bool Verify(string password, string passwordHash);
}

public interface IAccessTokenIssuer
{
    string Issue(AuthenticatedUser user);
}

public interface IAuthRuntime
{
    DateTimeOffset UtcNow { get; }
    bool UseFixedTestOtp { get; }
    void LogOtpChallengeCreated();
}

public interface IOtpCodeHasher
{
    string Hash(string phone, string code);
}

public interface IOtpChallengeStore
{
    Task SaveAsync(string phone, string codeHash, int lifetimeSeconds, CancellationToken cancellationToken);
    Task<bool> TryConsumeAsync(string phone, string codeHash, CancellationToken cancellationToken);
}

public interface ICurrentUser
{
    string? Id { get; }
    string? Role { get; }
    string? StoreId { get; }
    string? CustomerId { get; }
    string? Email { get; }
    string? Phone { get; }
}

public sealed record CustomerRegistration(string Phone, string Name, string StoreId, bool PrivacyPolicy, bool TermsOfService, RequestContext Context);
public sealed record RegistrationResult(bool StoreNotFound, AuthenticatedUser? User);
public sealed record UserSession(string UserId, string RefreshTokenHash, string? UserAgent, string? IpAddress, DateTimeOffset ExpiresAt);
public sealed record RefreshSessionRotation(string RefreshTokenHash, string NewRefreshTokenHash, string? UserAgent, string? IpAddress, DateTimeOffset ExpiresAt);
