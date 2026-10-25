-- CI runs this after each deploy (D276). Between `wrangler d1 migrations apply` and `wrangler deploy`, the old Worker
-- can still use a code without adding its device. Safe to run any number of times: a device is added only once.
INSERT INTO activation_devices (activation_id, code_id, device_label, activated_at, app_version, build_id)
SELECT c.activation_id, c.id, 'Other device', c.used_at, c.app_version, c.build_id
FROM activation_codes c
WHERE c.status = 'used' AND c.activation_id IS NOT NULL AND c.used_at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM activation_devices d WHERE d.activation_id = c.activation_id);
