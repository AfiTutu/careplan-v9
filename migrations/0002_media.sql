PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS media_assets (
  workspace_slug TEXT NOT NULL,
  id TEXT NOT NULL,
  object_key TEXT NOT NULL,
  thumbnail_key TEXT,
  file_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('image','video')),
  size_bytes INTEGER NOT NULL,
  thumbnail_content_type TEXT,
  encryption_format TEXT NOT NULL DEFAULT 'careplan-binary-encrypted',
  key_id TEXT NOT NULL,
  iv_b64 TEXT NOT NULL,
  thumbnail_iv_b64 TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  PRIMARY KEY (workspace_slug, id),
  FOREIGN KEY (workspace_slug) REFERENCES workspaces(slug) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_media_workspace_created ON media_assets(workspace_slug, created_at DESC);
