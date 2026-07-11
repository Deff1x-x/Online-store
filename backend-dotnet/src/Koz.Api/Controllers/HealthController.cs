using System.Globalization;
using Microsoft.AspNetCore.Mvc;

namespace Koz.Api.Controllers;

[ApiController]
[Route("api/health")]
public sealed class HealthController : ControllerBase
{
    [HttpGet]
    [ProducesResponseType<HealthResponse>(StatusCodes.Status200OK)]
    public ActionResult<HealthResponse> Get() => Ok(new HealthResponse(
        "ok",
        "koz-backend",
        DateTimeOffset.UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture)));
}

public sealed record HealthResponse(string Status, string Service, string Timestamp);
