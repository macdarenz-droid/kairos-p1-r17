-- D276: one invite code works on up to `device_limit` devices (D274). Only additions: 0001 is never rewritten.

-- 0001's CHECK allows status 'revoked' only for a code never used, so a used code is revoked with revoked_at.
ALTER TABLE activation_codes ADD COLUMN device_limit INTEGER NOT NULL DEFAULT 3 CHECK (device_limit BETWEEN 1 AND 10);
ALTER TABLE activation_codes ADD COLUMN label TEXT;
ALTER TABLE activation_codes ADD COLUMN revoked_at TEXT;

-- One row per device that used a code. A removed device keeps its row, so it can be told it was removed (D278).
CREATE TABLE activation_devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activation_id TEXT NOT NULL UNIQUE,
  code_id INTEGER NOT NULL REFERENCES activation_codes(id),
  request_id TEXT,
  device_label TEXT NOT NULL,
  activated_at TEXT NOT NULL,
  app_version TEXT,
  build_id TEXT,
  last_seen_on TEXT,
  removed_at TEXT,
  removed_by TEXT CHECK (removed_by IN ('trader', 'owner')),
  CHECK ((removed_at IS NULL) = (removed_by IS NULL))
);

-- Counts a code's devices still in use.
CREATE INDEX idx_activation_devices_code
ON activation_devices(code_id, removed_at);

-- A retry with the same request id gets its device back instead of a new place (D275). Per code, and only while that
-- device is in use: a request id never links two codes, and a removed device's id doesn't block a new place.
CREATE UNIQUE INDEX idx_activation_devices_request
ON activation_devices(code_id, request_id)
WHERE request_id IS NOT NULL AND removed_at IS NULL;

-- Each used code's device becomes its first of 3. The same statement is deploy/backfill-devices.sql, which CI runs
-- again after the deploy for codes the old Worker used in between.
INSERT INTO activation_devices (activation_id, code_id, device_label, activated_at, app_version, build_id)
SELECT c.activation_id, c.id, 'Other device', c.used_at, c.app_version, c.build_id
FROM activation_codes c
WHERE c.status = 'used' AND c.activation_id IS NOT NULL AND c.used_at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM activation_devices d WHERE d.activation_id = c.activation_id);
