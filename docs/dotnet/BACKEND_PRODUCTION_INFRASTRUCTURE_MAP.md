# Production infrastructure map (updated)

**Goal:** BACKEND-PRODUCTION-INFRASTRUCTURE-IMPLEMENTATION  
**Approved path:** single Linux VPS · Docker Compose · Nginx · Certbot · server `.env`  
**PostgreSQL:** external by default (managed or host-installed); optional Compose profile `postgres`  
**Payment:** online initiation **disabled** for launch  
**Traffic switch:** Nginx `koz_active` upstream  

## Package locations

| Artifact | Path |
|---|---|
| Compose | `deploy/vps/docker-compose.yml` |
| Optional Postgres | `deploy/vps/docker-compose.postgres.yml` |
| Nginx | `deploy/vps/nginx/` |
| Env template | `deploy/vps/.env.production.example` |
| Scripts | `scripts/vps/*.sh` |
| .NET image | `backend-dotnet/Dockerfile` |
| Node rollback image | `Dockerfile.node` |

## Access model (package vs live VPS)

This package **closes the prior mapping blocker** by fixing the target topology in-repo.  
Live VPS IP/hostname/credentials remain **operator-filled placeholders** (`api.example.com`, `SERVER_IP`, `.env` secrets).

## Node topology (Compose)

- One `node-api` container for rollback  
- Process-local OTP Map remains a rollback limitation  
- Shared JWT/DB with .NET when using same secrets/DB  

## .NET topology (Compose)

- One `dotnet-api` replica by default (scale intentionally)  
- Internal `8080` only; Nginx terminates TLS  
- ForwardedHeaders enabled with KnownNetworks/Proxies  
- `stop_grace_period: 35s` ≥ app shutdown 30s  

## Observability

Minimum: Docker health, Nginx JSON access/error logs + `X-Request-ID`, `observe.sh`, SQL activity queries by operator.  
Centralized metrics/alerts: **still a production condition** (not shipped here).
