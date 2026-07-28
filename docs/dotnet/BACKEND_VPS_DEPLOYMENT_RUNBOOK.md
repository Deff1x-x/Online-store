# VPS deployment runbook

**Platform:** single Linux VPS · Docker Compose · Nginx · Certbot  
**Package root:** `deploy/vps/`  
**Do not treat placeholders (`api.example.com`, `SERVER_IP`) as real values.**

## 1. Host prep

- Ubuntu 22.04/24.04 (or equivalent) with Docker Engine + Compose plugin  
- Open ports **80/443** only to the internet  
- Clone repo to `/opt/koz` (example path)  
- Copy env: `cp deploy/vps/.env.production.example deploy/vps/.env` → fill secrets → `chmod 600 deploy/vps/.env`

```bash
./scripts/vps/validate-host.sh
./scripts/vps/validate-env.sh deploy/vps/.env
```

## 2. DNS / TLS (placeholders)

| Item | Placeholder |
|---|---|
| API A/AAAA | `api.example.com` → `SERVER_IP` |
| Frontend origin | `https://app.example.com` |
| DNS TTL before cutover | lower TTL (e.g. 300s) ahead of window |
| Cert | Certbot webroot into `certbot_www` volume / host path mounted at `/var/www/certbot` |

Issue cert (operator machine / VPS):

```bash
# Example only — adjust domains and webroot
certbot certonly --webroot -w /var/www/certbot -d api.example.com
# Install fullchain.pem + privkey.pem into deploy/vps/nginx/tls/ (mode 600 for key)
```

Renewal: Certbot timer + Nginx reload hook. Test: `curl -fsSI https://api.example.com/api/health`

## 3. Database

Default: **external** Postgres (managed or host service). Set `DATABASE_HOST` accordingly.  
Optional co-located: `docker compose --profile postgres -f docker-compose.yml -f docker-compose.postgres.yml up -d`

## 4. Build & start (outside public trust until Nginx points correctly)

```bash
export KOZ_IMAGE_TAG="$(git rev-parse HEAD)"
./scripts/vps/build-artifacts.sh
./scripts/vps/start-stack.sh
./scripts/vps/direct-smoke.sh dotnet-api 8080
```

## 5. Observability minimum

See operations checklist — Docker health, Nginx JSON logs (`X-Request-ID`), `observe.sh`. Centralized metrics remain a **production condition**.

## 6. Payment

Launch decision: **disabled**. Env must keep `PAYMENTS_ONLINE_INITIATION_ENABLED=false`.
