PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS workspaces (
  slug TEXT PRIMARY KEY,
  data_json TEXT NOT NULL,
  etag TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 5,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_slug TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  role TEXT NOT NULL CHECK (role IN ('owner','editor','viewer')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (workspace_slug, email),
  FOREIGN KEY (workspace_slug) REFERENCES workspaces(slug) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workspace_invites (
  workspace_slug TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  role TEXT NOT NULL CHECK (role IN ('owner','editor','viewer')),
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  PRIMARY KEY (workspace_slug, email)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  workspace_slug TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  etag TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_audit_workspace_time ON audit_log(workspace_slug, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_members_email ON workspace_members(email);
