# BACKEND-OTP-SHARED-STORAGE Report

## Goal

Replace process-local OTP storage with PostgreSQL shared storage while preserving the public auth REST contract.

## OTP contract (unchanged)

| Behavior | Rule |
|---|---|
| Identifier | Normalized phone (`Trim`) — lookup key and PK |
| Create | Upsert challenge for phone; TTL **300** seconds |
| Code | 4-digit; Testing uses fixed `1234` |
| Wrong code | Does **not** consume; challenge remains |
| Expired | Verify fails (`invalid_otp`) |
| Correct code | Single-use consume |
| Overwrite | New OTP for same phone replaces hash/TTL and clears `consumed_at` |
| Attempts | No attempt counter |
| Errors | `403` / `invalid_otp` / `Invalid or expired OTP code` |
| Login unknown customer after valid OTP | `404` / `customer_not_found` (OTP already consumed; same order as pre-shared-store) |

## Schema / migration

**Table:** `otp_challenges`

| Column | Type | Notes |
|---|---|---|
| `phone` | `VARCHAR(32) PRIMARY KEY` | Challenge identifier / overwrite key |
| `code_hash` | `TEXT NOT NULL` | HMAC-SHA256 hex (64 chars); never plaintext |
| `created_at` | `TIMESTAMPTZ NOT NULL` | `NOW()` on insert/upsert |
| `expires_at` | `TIMESTAMPTZ NOT NULL` | `NOW() + lifetime` on insert/upsert |
| `consumed_at` | `TIMESTAMPTZ NULL` | Set to `NOW()` on successful consume |

**Index:** `idx_otp_challenges_expires_at` on `(expires_at) WHERE consumed_at IS NULL`

**Files:**
- `database/schema.sql` (clean install)
- `database/migrations/003_otp_challenges.sql` (append-only; idempotent `IF NOT EXISTS`)

Migration applied successfully on: empty/new `koz_dotnet_otp_test`, existing NET-* test DBs (pre-OTP), and re-run (no-op).

## Hashing

- Algorithm: `HMAC-SHA256(OTP_SECRET, UTF8(phone + "\n" + code))` → lowercase hex
- Phone normalized with the same `Trim` on create and consume
- Options: `OtpOptions` / `OTP_SECRET` / `Otp:Secret`
- Required outside local Development; Development may use dedicated non-production fallback
- Must be ≥32 chars after trim, not `change_this_secret`, and **must not equal** `JWT_SECRET` (ordinal)
- Whitespace-only config fails outside Development
- Secret never logged, never stored in the table, never embedded in exception text
- `HMACSHA256.HashData` is allocation-based (no disposable instance required)

## Atomic consume (database time)

```sql
UPDATE otp_challenges
SET consumed_at = NOW()
WHERE phone = $1
  AND code_hash = $2
  AND consumed_at IS NULL
  AND expires_at > NOW()
RETURNING phone;
```

Save:

```sql
INSERT INTO otp_challenges(phone, code_hash, created_at, expires_at, consumed_at)
VALUES ($1, $2, NOW(), NOW() + make_interval(secs => $3), NULL)
ON CONFLICT (phone) DO UPDATE
SET code_hash = EXCLUDED.code_hash,
    created_at = NOW(),
    expires_at = NOW() + make_interval(secs => $3),
    consumed_at = NULL;
```

TTL and consume timestamps use PostgreSQL `NOW()` so API instance clock skew cannot break single-use/expiry.

Correctness does **not** depend on background cleanup; expired rows simply fail the predicate.

## Failure atomicity (documented risk)

Consume happens **before** customer lookup / registration / session insert — identical ordering to the previous in-memory `TryRemove` then repository call.

If consume succeeds and a later DB step fails, the OTP remains consumed (client must request a new OTP). This matches the pre-shared-store Node/.NET contract; no new cross-table transaction was introduced.

## Application / infrastructure

- `IOtpChallengeStore`, `IOtpCodeHasher` in Application
- `PostgresOtpChallengeStore` in Infrastructure (parameterized Npgsql, `CancellationToken`, `await using` commands)
- `HmacOtpCodeHasher` + `OtpOptions` in Api; loaded at startup (fail-fast)
- Singletons: store/hasher/AuthService/NpgsqlDataSource (data source is the supported pool singleton; no captive scoped deps)
- In-memory store only in isolated API log-capture test (replaces DI for that host)

## Concurrency results

| Suite | Result |
|---|---|
| Repository `Task.WhenAll` 5× consume × 5 resets | Exactly **1** success / **4** fail per run |
| HTTP login race 5× × 5 resets (unknown phone) | **1×** `404 customer_not_found` (winner consumed OTP) + **4×** `403 invalid_otp` |

The `404` is the existing login contract after a successful OTP for a phone with no customer — not an unstable race artifact.

## Persistence / multi-host

Challenge created on factory A is verified on factory B against the same DB; wrong code leaves challenge usable; successful consume is single-use.

## Skips

| Test | Reason |
|---|---|
| `PostgresConnectionTests.Configured_separate_test_database_accepts_a_connection` | Requires `KOZ_TEST_DATABASE_CONNECTION_STRING` → DB name `koz_dotnet_net0_test` (NET-0 harness). **Not** part of OTP suite. |

## Rollback considerations

- Drop `otp_challenges` / reverse `003` restores prior schema
- Application would need the previous in-memory store to run again (not recommended for multi-instance)

## Production requirements

1. Apply `003_otp_challenges.sql` (or redeploy from updated `schema.sql`)
2. Set `OTP_SECRET` (≥32, ≠ `JWT_SECRET`)
3. Keep existing `JWT_SECRET` and CORS requirements from audit remediation

## Verification

After review fix (consume/save use PostgreSQL `NOW()`), two consecutive full green runs with no further code changes:

| Run | Api | Integration | Skip |
|---|---|---|---|
| 1 | 29/29 | 67/67 | 1 (`PostgresConnectionTests` / `KOZ_TEST_DATABASE_CONNECTION_STRING`) |
| 2 | 29/29 | 67/67 | same |

`git diff --check` clean. Commit not performed.
