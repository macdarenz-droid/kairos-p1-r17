-- CI runs this before `wrangler d1 migrations apply` (D276). The production table was made by hand, so wrangler's own
-- record doesn't list 0001 and would try to make the table again. This creates wrangler 4.141.0's record table, as
-- wrangler does (d1_migrations: id, name UNIQUE, applied_at), and records 0001 by its file name only when the table
-- exists. On a database without it, nothing is recorded and wrangler applies 0001 itself. Safe to run again.
CREATE TABLE IF NOT EXISTS d1_migrations(
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT UNIQUE,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
INSERT INTO d1_migrations (name)
SELECT '0001_activation_codes.sql'
WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'activation_codes')
  AND NOT EXISTS (SELECT 1 FROM d1_migrations WHERE name = '0001_activation_codes.sql');
