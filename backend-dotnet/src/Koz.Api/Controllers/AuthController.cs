using Koz.Application.Auth;
using Microsoft.AspNetCore.Mvc;

namespace Koz.Api.Controllers;

[ApiController]
[Route("api/auth")]
public sealed class AuthController(AuthService authService) : ControllerBase
{
    [HttpPost("otp")]
    [ProducesResponseType<OtpResponse>(StatusCodes.Status200OK)]
    public async Task<ActionResult<OtpResponse>> CreateOtp([FromBody] OtpRequest request, CancellationToken cancellationToken) =>
        Ok(await authService.CreateOtpChallengeAsync(request, cancellationToken));

    [HttpPost("register")]
    [ProducesResponseType<CustomerAuthResponse>(StatusCodes.Status201Created)]
    public async Task<ActionResult<CustomerAuthResponse>> Register([FromBody] RegisterCustomerRequest request, CancellationToken cancellationToken) =>
        StatusCode(StatusCodes.Status201Created, await authService.RegisterCustomerAsync(request, RequestContext(), cancellationToken));

    /// <summary>TZ А5 alias of <c>/register</c>.</summary>
    [HttpPost("register-phone")]
    [ProducesResponseType<CustomerAuthResponse>(StatusCodes.Status201Created)]
    public Task<ActionResult<CustomerAuthResponse>> RegisterPhone([FromBody] RegisterCustomerRequest request, CancellationToken cancellationToken) =>
        Register(request, cancellationToken);

    [HttpPost("login")]
    [ProducesResponseType<CustomerAuthResponse>(StatusCodes.Status200OK)]
    public async Task<ActionResult<CustomerAuthResponse>> LoginCustomer([FromBody] CustomerLoginRequest request, CancellationToken cancellationToken) =>
        Ok(await authService.LoginCustomerAsync(request, RequestContext(), cancellationToken));

    /// <summary>TZ А5 alias of <c>/login</c> (OTP consume).</summary>
    [HttpPost("verify-otp")]
    [ProducesResponseType<CustomerAuthResponse>(StatusCodes.Status200OK)]
    public Task<ActionResult<CustomerAuthResponse>> VerifyOtp([FromBody] CustomerLoginRequest request, CancellationToken cancellationToken) =>
        LoginCustomer(request, cancellationToken);

    [HttpPost("staff/login")]
    [ProducesResponseType<StaffAuthResponse>(StatusCodes.Status200OK)]
    public async Task<ActionResult<StaffAuthResponse>> LoginStaff([FromBody] StaffLoginRequest request, CancellationToken cancellationToken) =>
        Ok(await authService.LoginStaffAsync(request, cancellationToken));

    /// <summary>TZ А5 alias of <c>/staff/login</c>.</summary>
    [HttpPost("login-admin")]
    [ProducesResponseType<StaffAuthResponse>(StatusCodes.Status200OK)]
    public Task<ActionResult<StaffAuthResponse>> LoginAdmin([FromBody] StaffLoginRequest request, CancellationToken cancellationToken) =>
        LoginStaff(request, cancellationToken);

    [HttpPost("refresh")]
    [ProducesResponseType<CustomerAuthResponse>(StatusCodes.Status200OK)]
    public async Task<ActionResult<CustomerAuthResponse>> Refresh([FromBody] RefreshRequest request, CancellationToken cancellationToken) =>
        Ok(await authService.RefreshAsync(request, RequestContext(), cancellationToken));

    private RequestContext RequestContext() => new(HttpContext.Connection.RemoteIpAddress?.ToString(), Request.Headers.UserAgent.ToString());
}
