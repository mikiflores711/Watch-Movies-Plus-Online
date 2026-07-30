CREATE TABLE IF NOT EXISTS movie_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_key TEXT NOT NULL,
  content_type TEXT NOT NULL,
  content_id TEXT NOT NULL,
  title TEXT NOT NULL,
  year TEXT DEFAULT '',
  season TEXT DEFAULT '',
  episode TEXT DEFAULT '',
  episode_title TEXT DEFAULT '',
  server_name TEXT DEFAULT '',
  media_url TEXT DEFAULT '',
  problem TEXT NOT NULL,
  comment TEXT DEFAULT '',
  page_url TEXT DEFAULT '',
  user_agent TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Pendiente',
  report_count INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_movie_reports_open
ON movie_reports(report_key)
WHERE status IN ('Pendiente','En revisión');

CREATE INDEX IF NOT EXISTS idx_movie_reports_status
ON movie_reports(status);

CREATE TABLE IF NOT EXISTS movie_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER,
  content_label TEXT DEFAULT '',
  action TEXT NOT NULL,
  detail TEXT DEFAULT '',
  actor TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS movie_sessions (
  token_hash TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
