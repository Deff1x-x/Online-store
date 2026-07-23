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
using Koz.Application.Payments;
using Koz.Application.Notifications;
using Koz.Application.Customers;
using Koz.Infrastructure.Auth;
using Koz.Infrastructure.Postgres;
using Koz.Infrastructure.Read;
using Koz.Infrastructure.Commerce;
using Koz.Infrastructure.Orders;
using Koz.Infrastructure.AdminCatalog;
using Koz.Infrastructure.AdminCustomers;
using Koz.Infrastructure.AdminOperations;
using Koz.Infrastructure.Payments;
using Koz.Infrastructure.Notifications;
using Koz.Infrastructure.Customers;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.IdentityModel.Tokens;
using Npgsql;

var builder = WebApplication.CreateBuilder(args);

builder.Logging.ClearProviders();
builder.Logging.AddConsole();

var databaseOptions = DatabaseOptions.Load(builder.Configuration, builder.Environment);
var jwtOptions = JwtOptions.Load(builder.Configuration, builder.Environment);
var otpOptions = OtpOptions.Load(builder.Configuration, builder.Environment, jwtOptions.Secret);
var corsOptions = CorsOptions.Load(builder.Configuration, builder.Environment);
builder.Services.Configure<HostOptions>(options =>
{
    // Bounded drain for in-flight work; do not wait forever for long requests.
    var seconds = builder.Configuration.GetValue("Host:ShutdownTimeoutSeconds", 30);
    options.ShutdownTimeout = TimeSpan.FromSeconds(Math.Clamp(seconds, 5, 120));
});
builder.Services.AddSingleton(databaseOptions);
builder.Services.AddSingleton(jwtOptions);
builder.Services.AddSingleton(otpOptions);
builder.Services.AddSingleton(corsOptions);
builder.Services.AddSingleton<NpgsqlDataSource>(_ => NpgsqlDataSource.Create(databaseOptions.ConnectionString));
builder.Services.AddHostedService<DatabaseConnectionValidator>();
builder.Services.AddSingleton<TimeProvider>(TimeProvider.System);
builder.Services.AddSingleton<IAuthRepository, PostgresAuthRepository>();
builder.Services.AddSingleton<IOtpChallengeStore, PostgresOtpChallengeStore>();
builder.Services.AddSingleton<IOtpCodeHasher, HmacOtpCodeHasher>();
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
builder.Services.AddSingleton<IPaymentRepository, PostgresPaymentRepository>();
builder.Services.AddSingleton<PaymentService>();
builder.Services.AddSingleton<INotificationRepository, PostgresNotificationRepository>();
builder.Services.AddSingleton<NotificationService>();
builder.Services.AddSingleton<ICustomerMutationRepository, PostgresCustomerMutationRepository>();
builder.Services.AddSingleton<CustomerMutationService>();
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ICurrentUser, HttpCurrentUser>();
builder.Services.AddHealthChecks()
    .AddCheck<ShutdownReadinessHealthCheck>("shutdown", tags: ["ready"])
    .AddCheck<PostgresReadinessHealthCheck>("postgres", tags: ["ready"]);

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
        if (corsOptions.AllowedOrigins.Count == 0)
        {
            // Non-production may run with no browser origins (API-only). Policy denies browser CORS.
            policy.SetIsOriginAllowed(_ => false);
            return;
        }

        policy.WithOrigins(corsOptions.AllowedOrigins.ToArray()).AllowAnyHeader().AllowAnyMethod();
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
app.MapHealthChecks("/health/ready", new HealthCheckOptions
{
    Predicate = check => check.Tags.Contains("ready"),
    ResponseWriter = async (context, report) =>
    {
        context.Response.ContentType = "application/json";
        var status = report.Status == HealthStatus.Healthy ? "ready" : "not_ready";
        await context.Response.WriteAsJsonAsync(new { status });
    },
    ResultStatusCodes =
    {
        [HealthStatus.Healthy] = StatusCodes.Status200OK,
        [HealthStatus.Degraded] = StatusCodes.Status503ServiceUnavailable,
        [HealthStatus.Unhealthy] = StatusCodes.Status503ServiceUnavailable,
    },
});
if (app.Environment.IsEnvironment("Testing"))
{
    TestingAuthEndpoints.Map(app);
}
app.MapFallback(() => Results.Json(new { message = "Route not found", code = "route_not_found" }, statusCode: StatusCodes.Status404NotFound));

app.Run();

public partial class Program;
