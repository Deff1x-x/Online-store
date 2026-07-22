using System.Security.Cryptography;
using System.Text;
using Koz.Domain.Auth;

namespace Koz.Application.Auth;

public sealed class AuthService(
    IAuthRepository repository,
    IPasswordVerifier passwordVerifier,
    IAccessTokenIssuer accessTokenIssuer,
    IAuthRuntime runtime,
    IOtpChallengeStore otpChallengeStore,
    IOtpCodeHasher otpCodeHasher)
{
    private const int OtpLifetimeSeconds = 300;
    private const int RefreshTokenLifetimeDays = 30;

    public async Task<OtpResponse> CreateOtpChallengeAsync(OtpRequest request, CancellationToken cancellationToken)
    {
        var phone = NormalizePhone(request.Phone);
        if (string.IsNullOrEmpty(phone))
        {
            throw new AuthContractException(400, "Phone number is required", "phone_required");
        }

        var code = runtime.UseFixedTestOtp ? "1234" : RandomNumberGenerator.GetInt32(0, 10000).ToString("D4");
        await otpChallengeStore.SaveAsync(phone, otpCodeHasher.Hash(phone, code), OtpLifetimeSeconds, cancellationToken);
        runtime.LogOtpChallengeCreated();

        return new OtpResponse("OTP code has been sent", OtpLifetimeSeconds);
    }

    public async Task<CustomerAuthResponse> RegisterCustomerAsync(RegisterCustomerRequest request, RequestContext context, CancellationToken cancellationToken)
    {
        var phone = NormalizePhone(request.Phone);
        if (request.PrivacyPolicy is not true || request.TermsOfService is not true)
        {
            throw new AuthContractException(400, "Privacy policy and terms of service consents are required", "consents_required");
        }

        if (string.IsNullOrEmpty(phone) || string.IsNullOrEmpty(request.Code) || string.IsNullOrEmpty(request.Name) || string.IsNullOrEmpty(request.StoreId))
        {
            throw new AuthContractException(400, "Phone, OTP code, name and store_id are required", "registration_required_fields");
        }

        if (!await TryConsumeOtpAsync(phone, request.Code, cancellationToken))
        {
            throw new AuthContractException(403, "Invalid or expired OTP code", "invalid_otp");
        }

        RegistrationResult result;
        try
        {
            result = await repository.CreateCustomerRegistrationAsync(
                new CustomerRegistration(phone, request.Name, request.StoreId, true, true, context),
                cancellationToken);
        }
        catch (DuplicateUserContactException)
        {
            throw new AuthContractException(409, "User with this phone already exists", "duplicate_user_contact");
        }

        if (result.StoreNotFound)
        {
            throw new AuthContractException(400, "Selected store does not exist or is not active", "store_not_active");
        }

        return await IssueCustomerTokensAsync(result.User!, context, cancellationToken);
    }

    public async Task<CustomerAuthResponse> LoginCustomerAsync(CustomerLoginRequest request, RequestContext context, CancellationToken cancellationToken)
    {
        var phone = NormalizePhone(request.Phone);
        if (string.IsNullOrEmpty(phone) || string.IsNullOrEmpty(request.Code))
        {
            throw new AuthContractException(400, "Phone and OTP code are required", "login_required_fields");
        }

        if (!await TryConsumeOtpAsync(phone, request.Code, cancellationToken))
        {
            throw new AuthContractException(403, "Invalid or expired OTP code", "invalid_otp");
        }

        var user = await repository.FindCustomerByPhoneAsync(phone, cancellationToken);
        if (user is null || user.Role != UserRole.Customer)
        {
            throw new AuthContractException(404, "Customer was not found", "customer_not_found");
        }

        return await IssueCustomerTokensAsync(user, context, cancellationToken);
    }

    public async Task<StaffAuthResponse> LoginStaffAsync(StaffLoginRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(request.Email) || string.IsNullOrEmpty(request.Password))
        {
            throw new AuthContractException(400, "Email and password are required", "staff_login_required_fields");
        }

        var user = await repository.FindStaffByEmailAsync(request.Email, cancellationToken);
        if (user is null || user.Role == UserRole.Customer)
        {
            throw new AuthContractException(401, "Invalid email or password", "invalid_credentials");
        }

        if (string.IsNullOrEmpty(user.PasswordHash))
        {
            throw new AuthContractException(403, "Password login is not configured for this user", "password_not_configured");
        }

        if (!passwordVerifier.Verify(request.Password, user.PasswordHash))
        {
            throw new AuthContractException(401, "Invalid email or password", "invalid_credentials");
        }

        return new StaffAuthResponse(
            accessTokenIssuer.Issue(user),
            new StaffUserResponse(user.Id, user.Email, user.Name, user.Role.ToContractValue(), user.StoreId));
    }

    public async Task<CustomerAuthResponse> RefreshAsync(RefreshRequest request, RequestContext context, CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(request.RefreshToken))
        {
            throw new AuthContractException(400, "Refresh token is required", "refresh_token_required");
        }

        var newRefreshToken = GenerateRefreshToken();
        var user = await repository.RotateRefreshSessionAsync(
            new RefreshSessionRotation(
                HashRefreshToken(request.RefreshToken),
                HashRefreshToken(newRefreshToken),
                context.UserAgent,
                context.IpAddress,
                runtime.UtcNow.AddDays(RefreshTokenLifetimeDays)),
            cancellationToken);

        if (user is null)
        {
            throw new AuthContractException(401, "Invalid or expired refresh token", "invalid_refresh_token");
        }

        return new CustomerAuthResponse(accessTokenIssuer.Issue(user), newRefreshToken, ToCustomerUser(user));
    }

    private Task<bool> TryConsumeOtpAsync(string phone, string code, CancellationToken cancellationToken) =>
        otpChallengeStore.TryConsumeAsync(phone, otpCodeHasher.Hash(phone, code), cancellationToken);

    private async Task<CustomerAuthResponse> IssueCustomerTokensAsync(AuthenticatedUser user, RequestContext context, CancellationToken cancellationToken)
    {
        var refreshToken = GenerateRefreshToken();
        await repository.CreateUserSessionAsync(
            new UserSession(user.Id, HashRefreshToken(refreshToken), context.UserAgent, context.IpAddress, runtime.UtcNow.AddDays(RefreshTokenLifetimeDays)),
            cancellationToken);

        return new CustomerAuthResponse(accessTokenIssuer.Issue(user), refreshToken, ToCustomerUser(user));
    }

    private static AuthUserResponse ToCustomerUser(AuthenticatedUser user) => new(
        user.Id,
        user.Phone,
        user.Email,
        user.Name,
        user.StoreId,
        user.Role.ToContractValue(),
        user.CustomerId,
        user.SubscriptionStatus);

    private static string NormalizePhone(string? phone) => phone?.Trim() ?? string.Empty;

    private static string GenerateRefreshToken() => Convert.ToBase64String(RandomNumberGenerator.GetBytes(48))
        .TrimEnd('=')
        .Replace('+', '-')
        .Replace('/', '_');

    private static string HashRefreshToken(string refreshToken) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(refreshToken))).ToLowerInvariant();
}

public sealed class DuplicateUserContactException : Exception
{
}
