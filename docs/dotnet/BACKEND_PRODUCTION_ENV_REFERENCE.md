# Backend production environment reference (VPS Compose)

**Topology:** Linux VPS + Docker Compose + Nginx  
**Payment launch decision:** online payment **disabled**  
**Secrets:** never commit; use `deploy/vps/.env` mode `600`

## Template

Copy `deploy/vps/.env.production.example` → `deploy/vps/.env` on the server.

## Required variables

| Name | Notes |
|---|---|
| `ASPNETCORE_ENVIRONMENT` | Must be `Production` |
| `ASPNETCORE_URLS` | `http://+:8080` inside container |
| `DATABASE_*` | Host/port/name/user/password; password ≠ `postgres` |
| `DATABASE_MAX_POOL_SIZE` | Default package recommendation **20** (see pool budget) |
| `JWT_SECRET` | ≥32; not Development default |
| `OTP_SECRET` | ≥32; **≠ JWT_SECRET**; shared by all .NET replicas |
| `Cors__AllowedOrigins__N` | Exact origins (`https://app.example.com`), no `*`, no trailing slash |
| `ForwardedHeaders__Enabled` | `true` behind Nginx |
| `ForwardedHeaders__KnownNetworks__N` / `KnownProxies__N` | Docker bridge CIDR / Nginx IP only |
| `PAYMENTS_ONLINE_INITIATION_ENABLED` | **`false`** for launch |

## Restart policy

Any env change requires container recreate (`docker compose up -d`).

## Validation

```bash
./scripts/vps/validate-env.sh deploy/vps/.env
```
