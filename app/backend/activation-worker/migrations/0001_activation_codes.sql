CREATE TABLE activation_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'unused'
    CHECK (status IN ('unused', 'used', 'revoked')),
  created_at TEXT NOT NULL,
  expires_at TEXT,
  used_at TEXT,
  activation_id TEXT UNIQUE,
  app_version TEXT,
  build_id TEXT,
  CHECK (
    (status = 'unused' AND used_at IS NULL AND activation_id IS NULL)
    OR
    (status = 'used' AND used_at IS NOT NULL AND activation_id IS NOT NULL)
    OR
    (status = 'revoked' AND used_at IS NULL AND activation_id IS NULL)
  )
);

CREATE INDEX idx_activation_codes_status
ON activation_codes(status);
