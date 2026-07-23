# Backend rollback runbook

## Application rollback

1. Switch traffic back to Node (LB / base URL).
2. Confirm Node `GET /api/health` (and DB connectivity).
3. Keep .NET stopped or out of rotation.
4. **Do not** drop `otp_challenges` or reverse migration 003.

## Data compatibility

| Area | Rollback behavior |
|---|---|
| Orders / inventory / payments rows written by .NET | Readable by Node (same schema) |
| Migration 003 table | Harmless to Node (unused) |
| JWT | Compatible if same `JWT_SECRET` |
| OTP challenges created on .NET | **Not** consumable by Node memory Map |

## OTP rollback limitation (mandatory communication)

Node does **not** read `otp_challenges`. After rollback to Node:

- In-flight OTP challenges issued by .NET are **invalid** for Node consume.
- Users must **request a new OTP** on Node.
- This is an accepted cutover limitation, not a schema defect.

## Payment note

Node may still expose placeholder online initiation; Production .NET keeps it disabled. Rolling back re-exposes Node placeholder behavior until Node is also gated.

## Verification after rollback

```powershell
# Against Node base URL
Invoke-RestMethod http://localhost:3000/api/health
# Confirm recent .NET-created order visible via Node customer/manager reads
```
