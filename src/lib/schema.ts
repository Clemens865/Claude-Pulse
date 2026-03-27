import type Database from "better-sqlite3";

/**
 * SQLite schema for Claude Pulse tracker database.
 * All tables use TEXT for timestamps (ISO 8601) and JSON strings for structured metadata.
 */

const SCHEMA_VERSION = 2;

const CREATE_TABLES = `
-- Session lifecycle tracking
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    project TEXT NOT NULL,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    ended_at TEXT,
    duration_seconds INTEGER,
    summary TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'completed', 'crashed'))
);

-- Granular tool events (append-only)
CREATE TABLE IF NOT EXISTS tool_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    tool_name TEXT NOT NULL,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    file_path TEXT,
    language TEXT,
    lines_added INTEGER DEFAULT 0,
    lines_removed INTEGER DEFAULT 0,
    command TEXT,
    detected_framework TEXT,
    command_failed INTEGER DEFAULT 0,
    search_pattern TEXT,
    agent_type TEXT,
    agent_description TEXT,
    skill_name TEXT,
    skill_args TEXT,
    metadata TEXT DEFAULT '{}'
);

-- Pre-computed daily summaries (survive event retention purge)
CREATE TABLE IF NOT EXISTS daily_summaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    project TEXT NOT NULL,
    session_count INTEGER DEFAULT 0,
    total_duration_seconds INTEGER DEFAULT 0,
    lines_added INTEGER DEFAULT 0,
    lines_removed INTEGER DEFAULT 0,
    net_lines INTEGER DEFAULT 0,
    files_created INTEGER DEFAULT 0,
    files_edited INTEGER DEFAULT 0,
    files_read INTEGER DEFAULT 0,
    tool_calls INTEGER DEFAULT 0,
    bash_commands INTEGER DEFAULT 0,
    bash_failures INTEGER DEFAULT 0,
    searches INTEGER DEFAULT 0,
    agents_spawned INTEGER DEFAULT 0,
    skills_used TEXT DEFAULT '{}',
    frameworks_detected TEXT DEFAULT '{}',
    languages TEXT DEFAULT '{}',
    tool_counts TEXT DEFAULT '{}',
    UNIQUE(date, project)
);

-- Structured insights (brain layer)
CREATE TABLE IF NOT EXISTS insights (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT REFERENCES sessions(id),
    project TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('progress','decision','pattern','fix','context','blocked')),
    content TEXT NOT NULL,
    reasoning TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Per-file daily activity tracking
CREATE TABLE IF NOT EXISTS file_activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT NOT NULL,
    project TEXT NOT NULL,
    date TEXT NOT NULL,
    edit_count INTEGER DEFAULT 0,
    write_count INTEGER DEFAULT 0,
    read_count INTEGER DEFAULT 0,
    lines_added INTEGER DEFAULT 0,
    lines_removed INTEGER DEFAULT 0,
    language TEXT,
    UNIQUE(file_path, project, date)
);
`;

const CREATE_INDEXES = `
-- Session indexes
CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);

-- Tool event indexes
CREATE INDEX IF NOT EXISTS idx_events_session ON tool_events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON tool_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_events_tool ON tool_events(tool_name);
CREATE INDEX IF NOT EXISTS idx_events_file ON tool_events(file_path);
CREATE INDEX IF NOT EXISTS idx_events_session_tool ON tool_events(session_id, tool_name);

-- Daily summary indexes
CREATE INDEX IF NOT EXISTS idx_summaries_date ON daily_summaries(date);
CREATE INDEX IF NOT EXISTS idx_summaries_project ON daily_summaries(project);

-- Insight indexes
CREATE INDEX IF NOT EXISTS idx_insights_project ON insights(project);
CREATE INDEX IF NOT EXISTS idx_insights_type ON insights(type);
CREATE INDEX IF NOT EXISTS idx_insights_session ON insights(session_id);
CREATE INDEX IF NOT EXISTS idx_insights_created ON insights(created_at);

-- File activity indexes
CREATE INDEX IF NOT EXISTS idx_file_activity_path ON file_activity(file_path);
CREATE INDEX IF NOT EXISTS idx_file_activity_project ON file_activity(project);
CREATE INDEX IF NOT EXISTS idx_file_activity_date ON file_activity(date);
`;

/**
 * Initialize the database schema. Safe to call multiple times --
 * all statements use IF NOT EXISTS.
 */
export function initDatabase(db: Database.Database): void {
  db.exec(CREATE_TABLES);
  db.exec(CREATE_INDEXES);

  // Set schema version if not already set
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const row = db.prepare("SELECT MAX(version) as v FROM schema_version").get() as
    | { v: number | null }
    | undefined;

  if (!row || row.v === null || row.v < SCHEMA_VERSION) {
    db.prepare("INSERT OR REPLACE INTO schema_version (version) VALUES (?)").run(
      SCHEMA_VERSION
    );
  }
}

export { SCHEMA_VERSION };
