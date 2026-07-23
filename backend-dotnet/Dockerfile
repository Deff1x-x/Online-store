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
 && useradd --system --uid 10001 --gid koz --home-dir /app --shell /usr/sbin/nologin koz
COPY --from=build /app/publish .
USER koz
ENV ASPNETCORE_URLS=http://+:8080
ENV ASPNETCORE_ENVIRONMENT=Production
EXPOSE 8080
# Graceful SIGTERM handled by ASP.NET Core HostOptions.ShutdownTimeout.
ENTRYPOINT ["dotnet", "Koz.Api.dll"]
