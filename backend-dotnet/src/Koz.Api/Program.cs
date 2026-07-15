using Koz.Api.Configuration;
using Koz.Api.Auth;
using Koz.Api.Middleware;
using Koz.Application.Auth;
using Koz.Application.Read;
using Koz.Application.Commerce;
using Koz.Application.Orders;
using Koz.Application.AdminCatalog;
using Koz.Application.AdminCustomers;
using Koz.Application.AdminOperations;
using Koz.Infrastructure.Auth;
using Koz.Infrastructure.Postgres;
using Koz.Infrastructure.Read;
using Koz.Infrastructure.Commerce;
using Koz.Infrastructure.Orders;
using Koz.Infrastructure.AdminCatalog;
using Koz.Infrastructure.AdminCustomers;
using Koz.Infrastructure.AdminOperations;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;
using Npgsql;

var builder = WebApplication.CreateBuilder(args);

builder.Logging.ClearProviders();
builder.Logging.AddConsole();

var databaseOptions = DatabaseOptions.Load(builder.Configuration);
var jwtOptions = JwtOptions.Load(builder.Configuration, builder.Environment);
builder.Services.AddSingleton(databaseOptions);
builder.Services.AddSingleton(jwtOptions);
builder.Services.AddSingleton<NpgsqlDataSource>(_ => NpgsqlDataSource.Create(databaseOptions.ConnectionString));
builder.Services.AddHostedService<DatabaseConnectionValidator>();
builder.Services.AddSingleton<TimeProvider>(TimeProvider.System);
builder.Services.AddSingleton<IAuthRepository, PostgresAuthRepository>();
builder.Services.AddSingleton<IPasswordVerifier, BcryptPasswordVerifier>();
builder.Services.AddSingleton<IAccessTokenIssuer, JwtAccessTokenIssuer>();
builder.Services.AddSingleton<IAuthRuntime, AspNetAuthRuntime>();
builder.Services.AddSingleton<AuthService>();
builder.Services.AddSingleton<IPublicReadRepository, PostgresPublicReadRepository>();
builder.Services.AddSingleton<PublicReadService>();
builder.Services.AddSingleton<ICommerceRepository, PostgresCommerceRepository>();
builder.Services.AddSingleton<CommerceService>();
builder.Services.AddSingleton<IOrderRepository, PostgresOrderRepository>();
builder.Services.AddSingleton<OrderService>();
builder.Services.AddSingleton<IManagerOrderRepository, PostgresOrderRepository>();
builder.Services.AddSingleton<ManagerOrderService>();
builder.Services.AddSingleton<ICustomerOrderRepository, PostgresOrderRepository>();
builder.Services.AddSingleton<CustomerOrderService>();
builder.Services.AddSingleton<IManagerInventoryRepository, PostgresOrderRepository>();
builder.Services.AddSingleton<ManagerInventoryService>();
builder.Services.AddSingleton<IAdminCatalogRepository, PostgresAdminCatalogRepository>();
builder.Services.AddSingleton<AdminCatalogService>();
builder.Services.AddSingleton<IAdminCustomerRepository, PostgresAdminCustomerRepository>();
builder.Services.AddSingleton<AdminCustomerService>();
builder.Services.AddSingleton<IAdminOperationsRepository, PostgresAdminOperationsRepository>();
builder.Services.AddSingleton<AdminOperationsService>();
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ICurrentUser, HttpCurrentUser>();

builder.Services.AddControllers();
builder.Services.Configure<ApiBehaviorOptions>(options =>
    options.InvalidModelStateResponseFactory = _ => new ObjectResult(new { message = "Internal server error", code = "internal_error" })
    {
        StatusCode = StatusCodes.Status500InternalServerError,
    });
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.MapInboundClaims = false;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(jwtOptions.SigningKey),
            ValidateIssuer = false,
            ValidateAudience = false,
            ValidateLifetime = true,
            RequireExpirationTime = true,
            ClockSkew = TimeSpan.Zero,
            ValidAlgorithms = [SecurityAlgorithms.HmacSha256],
        };
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                var authorization = context.Request.Headers.Authorization.ToString();
                if (string.IsNullOrEmpty(authorization))
                {
                    return Task.CompletedTask;
                }

                var parts = authorization.Split(' ');
                if (parts.Length < 2 || parts[0] != "Bearer" || string.IsNullOrEmpty(parts[1]))
                {
                    context.HttpContext.Items["auth_error"] = (401, "Authorization header must use Bearer token", "invalid_authorization_header");
                    context.NoResult();
                    return Task.CompletedTask;
                }

                context.Token = parts[1];
                return Task.CompletedTask;
            },
            OnChallenge = async context =>
            {
                context.HandleResponse();
                var error = context.HttpContext.Items["auth_error"] is ValueTuple<int, string, string> headerError
                    ? headerError
                    : context.AuthenticateFailure is null
                        ? (401, "Authorization token is required", "token_required")
                        : (403, "Invalid or expired authorization token", "invalid_token");
                context.Response.StatusCode = error.Item1;
                await context.Response.WriteAsJsonAsync(new { message = error.Item2, code = error.Item3 });
            },
            OnForbidden = async context =>
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                await context.Response.WriteAsJsonAsync(new { message = "Access denied", code = "access_denied" });
            },
        };
    });
builder.Services.AddAuthorization(AuthPolicies.Configure);
builder.Services.AddCors(options =>
{
    options.AddPolicy("koz", policy =>
    {
        var origins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
        policy.WithOrigins(origins).AllowAnyHeader().AllowAnyMethod();
    });
});

var app = builder.Build();

app.UseMiddleware<NodeCompatibleExceptionMiddleware>();
app.UseCors("koz");
app.UseAuthentication();
app.UseAuthorization();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.MapControllers();
if (app.Environment.IsEnvironment("Testing"))
{
    TestingAuthEndpoints.Map(app);
}
app.MapFallback(() => Results.Json(new { message = "Route not found", code = "route_not_found" }, statusCode: StatusCodes.Status404NotFound));

app.Run();

public partial class Program;
