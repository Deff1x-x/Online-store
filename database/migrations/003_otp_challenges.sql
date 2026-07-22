-- Adds shared OTP challenge storage for multi-instance auth.
-- Safe to re-run: creates table/index only when missing.

BEGIN;

CREATE TABLE IF NOT EXISTS otp_challenges (
    phone VARCHAR(32) PRIMARY KEY,
    code_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_otp_challenges_expires_at
    ON otp_challenges(expires_at)
    WHERE consumed_at IS NULL;

COMMIT;
