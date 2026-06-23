PRAGMA foreign_keys = off;

ALTER TABLE devices RENAME TO devices_old;

CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  workspace_id TEXT,
  account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  public_key TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  revoked_at TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

INSERT INTO devices (id, workspace_id, account_id, label, public_key, created_at, last_seen_at, revoked_at)
SELECT id, workspace_id, account_id, label, public_key, created_at, last_seen_at, revoked_at
FROM devices_old;

DROP TABLE devices_old;

PRAGMA foreign_keys = on;

CREATE INDEX IF NOT EXISTS idx_devices_account_seen
ON devices(account_id, last_seen_at DESC);
