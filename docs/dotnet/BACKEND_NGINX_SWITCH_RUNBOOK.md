# Nginx upstream switch runbook

## Files

| File | Role |
|---|---|
| `deploy/vps/nginx/conf.d/upstreams.conf` | Named `koz_dotnet` / `koz_node` |
| `deploy/vps/nginx/conf.d/active-upstream.conf` | **`koz_active`** — rewritten by switch scripts |
| `deploy/vps/nginx/conf.d/koz-api.conf` | TLS + `proxy_pass http://koz_active` |

## Switch to .NET (cutover)

```bash
./scripts/vps/nginx-switch-dotnet.sh
# Internally: write active-upstream.conf → docker compose exec nginx nginx -t → nginx -s reload
```

## Switch to Node (rollback)

```bash
./scripts/vps/nginx-switch-node.sh
```

## Manual verification

```bash
cd deploy/vps
docker compose exec -T nginx nginx -t
docker compose exec -T nginx nginx -s reload
curl -fsS https://api.example.com/api/health
```

## Safety notes

- Always `nginx -t` before reload  
- Graceful reload drains workers; prefer observation window before stopping Node  
- Do not expose container ports 8080/3000 publicly  
- Forwarded headers are set by Nginx; ASP.NET trusts only configured Docker networks/proxies
