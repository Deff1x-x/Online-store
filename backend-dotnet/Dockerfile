# syntax=docker/dockerfile:1
# Production multi-stage image for Koz.Api (.NET 10).
# Secrets (DATABASE_PASSWORD, JWT_SECRET, OTP_SECRET) MUST be supplied at runtime — never bake into layers.

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY Directory.Build.props ./
COPY Koz.sln ./
COPY src/Koz.Domain/Koz.Domain.csproj src/Koz.Domain/
COPY src/Koz.Application/Koz.Application.csproj src/Koz.Application/
COPY src/Koz.Infrastructure/Koz.Infrastructure.csproj src/Koz.Infrastructure/
COPY src/Koz.Api/Koz.Api.csproj src/Koz.Api/
RUN dotnet restore src/Koz.Api/Koz.Api.csproj
COPY src/ ./src/
RUN dotnet publish src/Koz.Api/Koz.Api.csproj -c Release -o /app/publish --no-restore /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app
RUN groupadd --system --gid 10001 koz \
 && useradd --system --uid 10001 --gid koz --home-dir /app --shell /usr/sbin/nologin koz \
 && apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/publish .
USER koz
ENV ASPNETCORE_URLS=http://+:8080
ENV ASPNETCORE_ENVIRONMENT=Production
EXPOSE 8080
# Compose/orchestrator health probes; graceful SIGTERM via HostOptions.ShutdownTimeout.
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8080/health/ready || exit 1
ENTRYPOINT ["dotnet", "Koz.Api.dll"]