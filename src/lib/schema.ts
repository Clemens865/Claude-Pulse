import type Database from "better-sqlite3";

/**
 * SQLite schema for Claude Pulse tracker database.
 * All tables use TEXT for timestamps (ISO 8601) and JSON strings for structured metadata.
 */

const SCHEMA_VERSION = 4;

const CREATE_TABLES = `
-- Session lifecycle tracking
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    project TEXT NOT NULL,
    project_path TEXT,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    ended_at TEXT,
    duration_seconds INTEGER,
    summary TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'completed', 'crashed')),
    user TEXT,
    hostname TEXT
);

-- Blueprint runs ingested from Lazy-Fetch .lazy/runs/*.json
CREATE TABLE IF NOT EXISTS blueprint_runs (
    id TEXT PRIMARY KEY,
    project TEXT NOT NULL,
    project_path TEXT NOT NULL,
    blueprint TEXT NOT NULL,
    input TEXT,
    status TEXT NOT NULL CHECK(status IN ('running','completed','failed')),
    started_at TEXT NOT NULL,
    completed_at TEXT,
    duration_ms INTEGER,
    step_count INTEGER NOT NULL DEFAULT 0,
    steps_done INTEGER NOT NULL DEFAULT 0,
    steps_failed INTEGER NOT NULL DEFAULT 0,
    worktree_path TEXT,
    worktree_branch TEXT,
    base_branch TEXT,
    step_results TEXT NOT NULL DEFAULT '[]',
    session_id TEXT,
    source_file TEXT NOT NULL,
    source_mtime INTEGER NOT NULL,
    ingested_at TEXT NOT NULL DEFAULT (datetime('now'))
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
    metadata TEXT DEFAULT '{}',
    diff_content TEXT
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

-- Blueprint run indexes
CREATE INDEX IF NOT EXISTS idx_runs_project ON blueprint_runs(project);
CREATE INDEX IF NOT EXISTS idx_runs_status ON blueprint_runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_started ON blueprint_runs(started_at);
CREATE INDEX IF NOT EXISTS idx_runs_blueprint ON blueprint_runs(blueprint);
`;

/**
 * Initialize the database schema. Safe to call multiple times --
 * all statements use IF NOT EXISTS.
 */
export function initDatabase(db: Database.Database): void {
  db.exec(CREATE_TABLES);
  db.exec(CREATE_INDEXES);

  // v3 -> v4: ensure project_path column exists on pre-existing sessions tables.
  // CREATE TABLE IF NOT EXISTS above won't add the column to an old table — only ALTER does.
  const sessionCols = db
    .prepare("PRAGMA table_info(sessions)")
    .all() as Array<{ name: string }>;
  if (!sessionCols.some((c) => c.name === "project_path")) {
    db.exec("ALTER TABLE sessions ADD COLUMN project_path TEXT");
  }

  // v4 -> v4.1: ensure session_id column exists on pre-existing blueprint_runs tables.
  const runCols = db
    .prepare("PRAGMA table_info(blueprint_runs)")
    .all() as Array<{ name: string }>;
  if (runCols.length > 0 && !runCols.some((c) => c.name === "session_id")) {
    db.exec("ALTER TABLE blueprint_runs ADD COLUMN session_id TEXT");
  }

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
