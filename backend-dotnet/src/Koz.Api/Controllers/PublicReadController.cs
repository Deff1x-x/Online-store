using Koz.Api.Auth;
using Koz.Application.Auth;
using Koz.Application.Read;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Koz.Api.Controllers;

[ApiController]
public sealed class PublicReadController(PublicReadService publicReadService, ICurrentUser currentUser) : ControllerBase
{
    [HttpGet("api/products/store/{store_id}")]
    [ProducesResponseType<StoreCatalogResponse>(StatusCodes.Status200OK)]
    public async Task<ActionResult<StoreCatalogResponse>> GetStoreCatalog([FromRoute(Name = "store_id")] string? storeId, CancellationToken cancellationToken) =>
        Ok(await publicReadService.GetStoreCatalogAsync(storeId, cancellationToken));

    [Authorize(Policy = AuthPolicies.Customer)]
    [HttpGet("api/my-profile")]
    [ProducesResponseType<ProfileResponse>(StatusCodes.Status200OK)]
    public async Task<ActionResult<ProfileResponse>> GetProfile(CancellationToken cancellationToken) =>
        Ok(await publicReadService.GetProfileAsync(currentUser.Id, cancellationToken));

    [Authorize(Policy = AuthPolicies.Customer)]
    [HttpGet("api/my-addresses")]
    [ProducesResponseType<AddressesResponse>(StatusCodes.Status200OK)]
    public async Task<ActionResult<AddressesResponse>> GetAddresses(CancellationToken cancellationToken) =>
        Ok(await publicReadService.GetAddressesAsync(currentUser.Id, cancellationToken));
}
