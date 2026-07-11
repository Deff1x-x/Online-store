using Koz.Api.Configuration;
using Koz.Api.Middleware;
using Koz.Infrastructure.Postgres;
using Npgsql;

var builder = WebApplication.CreateBuilder(args);

builder.Logging.ClearProviders();
builder.Logging.AddConsole();

var databaseOptions = DatabaseOptions.Load(builder.Configuration);
builder.Services.AddSingleton(databaseOptions);
builder.Services.AddSingleton<NpgsqlDataSource>(_ => NpgsqlDataSource.Create(databaseOptions.ConnectionString));
builder.Services.AddHostedService<DatabaseConnectionValidator>();

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
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

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.MapControllers();
app.MapFallback(() => Results.Json(new { message = "Route not found", code = "route_not_found" }, statusCode: StatusCodes.Status404NotFound));

app.Run();

public partial class Program;
