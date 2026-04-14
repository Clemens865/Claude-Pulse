#!/usr/bin/env bash
set -euo pipefail

# Claude Pulse Hook Script
# Receives events from Claude Code, writes to SQLite.
# Must complete in <100ms. Never fail loudly.

trap 'exit 0' ERR

# --- Dependencies check ---
command -v jq >/dev/null 2>&1 || { echo '{"error":"jq not found"}' >&2; exit 0; }
command -v sqlite3 >/dev/null 2>&1 || { echo '{"error":"sqlite3 not found"}' >&2; exit 0; }

# --- Constants ---
DB_DIR="$HOME/.claude-pulse"
DB_PATH="$DB_DIR/tracker.db"
SESSION_DIR="/tmp/claude-pulse-$$"

# --- User identity (for audit trail) ---
PULSE_USER="$(whoami 2>/dev/null)" || PULSE_USER="unknown"
PULSE_HOSTNAME="$(hostname -s 2>/dev/null)" || PULSE_HOSTNAME="unknown"

# --- Read stdin (JSON payload from Claude Code) ---
INPUT="$(cat)" || true
[ -z "$INPUT" ] && exit 0

# --- Parse common fields ---
# Claude Code provides hook_event_name (not hook_type) and session_id in stdin JSON
HOOK_TYPE="$(echo "$INPUT" | jq -r '.hook_event_name // .hook_type // empty' 2>/dev/null)" || true
SESSION_ID="$(echo "$INPUT" | jq -r '.session_id // empty' 2>/dev/null)" || true
CWD="$(echo "$INPUT" | jq -r '.cwd // empty' 2>/dev/null)" || true
TOOL_NAME="$(echo "$INPUT" | jq -r '.tool_name // empty' 2>/dev/null)" || true

[ -z "$HOOK_TYPE" ] && exit 0

# Fallback session ID if not provided
if [ -z "$SESSION_ID" ]; then
    SESSION_ID="session-$(date -u '+%Y%m%d-%H%M%S')-$$"
fi

# --- Session dir from Claude session ID ---
if [ -n "$SESSION_ID" ]; then
    SESSION_DIR="/tmp/claude-pulse-${SESSION_ID}"
fi

# --- Project detection ---
detect_project_path() {
    local dir="${1:-.}"
    local repo_root
    repo_root="$(cd "$dir" 2>/dev/null && git rev-parse --show-toplevel 2>/dev/null)" || true
    if [ -n "$repo_root" ]; then
        echo "$repo_root"
    else
        (cd "$dir" 2>/dev/null && pwd) || echo ""
    fi
}

detect_project() {
    local dir="${1:-.}"
    local repo_root
    repo_root="$(cd "$dir" 2>/dev/null && git rev-parse --show-toplevel 2>/dev/null)" || true
    if [ -n "$repo_root" ]; then
        basename "$repo_root"
    else
        basename "$dir"
    fi
}

PROJECT_PATH="$(detect_project_path "${CWD:-.}")"
PROJECT="$(detect_project "${CWD:-.}")" || PROJECT="unknown"

# --- Language detection from file extension ---
detect_language() {
    local fp="$1"
    [ -z "$fp" ] && echo "Unknown" && return
    local base ext
    base="$(basename "$fp" | tr '[:upper:]' '[:lower:]')"
    case "$base" in
        dockerfile|dockerfile.*) echo "Docker"; return ;;
        makefile|gnumakefile) echo "Makefile"; return ;;
        rakefile|gemfile) echo "Ruby"; return ;;
    esac
    ext="${fp##*.}"
    [ "$ext" = "$fp" ] && echo "Unknown" && return
    ext="$(echo "$ext" | tr '[:upper:]' '[:lower:]')"
    case "$ext" in
        js|jsx|mjs|cjs) echo "JavaScript" ;;
        ts|tsx) echo "TypeScript" ;;
        py) echo "Python" ;;
        rs) echo "Rust" ;;
        go) echo "Go" ;;
        rb) echo "Ruby" ;;
        java) echo "Java" ;;
        c|h) echo "C" ;;
        cpp|hpp|cc|cxx) echo "C++" ;;
        cs) echo "C#" ;;
        swift) echo "Swift" ;;
        kt) echo "Kotlin" ;;
        sh|bash|zsh|fish) echo "Shell" ;;
        html|htm) echo "HTML" ;;
        css) echo "CSS" ;;
        scss|sass) echo "SCSS" ;;
        json) echo "JSON" ;;
        yaml|yml) echo "YAML" ;;
        toml) echo "TOML" ;;
        xml) echo "XML" ;;
        md|mdx) echo "Markdown" ;;
        sql) echo "SQL" ;;
        prisma) echo "Prisma" ;;
        graphql|gql) echo "GraphQL" ;;
        vue) echo "Vue" ;;
        svelte) echo "Svelte" ;;
        tf|hcl) echo "Terraform" ;;
        proto) echo "Protobuf" ;;
        r) echo "R" ;;
        lua) echo "Lua" ;;
        php) echo "PHP" ;;
        pl) echo "Perl" ;;
        ex|exs) echo "Elixir" ;;
        dart) echo "Dart" ;;
        zig) echo "Zig" ;;
        *) echo "Unknown" ;;
    esac
}

# --- Framework detection from bash command ---
detect_frameworks() {
    local cmd="$1"
    local frameworks=""
    [ -z "$cmd" ] && return
    # Order matters: docker-compose before docker
    echo "$cmd" | grep -qw 'npm' && frameworks="${frameworks}npm/node,"
    echo "$cmd" | grep -qw 'npx' && frameworks="${frameworks}npx/node,"
    echo "$cmd" | grep -qw 'yarn' && frameworks="${frameworks}yarn/node,"
    echo "$cmd" | grep -qw 'pnpm' && frameworks="${frameworks}pnpm/node,"
    echo "$cmd" | grep -qw 'bun' && frameworks="${frameworks}bun,"
    echo "$cmd" | grep -qw 'node' && frameworks="${frameworks}node,"
    echo "$cmd" | grep -qw 'git' && frameworks="${frameworks}git,"
    echo "$cmd" | grep -qw 'docker-compose' && frameworks="${frameworks}docker-compose,"
    echo "$cmd" | grep -qw 'docker' && frameworks="${frameworks}docker,"
    echo "$cmd" | grep -qw 'python3\?\|python' && frameworks="${frameworks}python,"
    echo "$cmd" | grep -qw 'pip3\?\|pip' && frameworks="${frameworks}pip/python,"
    echo "$cmd" | grep -qw 'pytest' && frameworks="${frameworks}pytest/python,"
    echo "$cmd" | grep -qw 'uv' && frameworks="${frameworks}uv/python,"
    echo "$cmd" | grep -qw 'cargo' && frameworks="${frameworks}cargo/rust,"
    echo "$cmd" | grep -qw 'rustc' && frameworks="${frameworks}rustc/rust,"
    echo "$cmd" | grep -qw 'go' && frameworks="${frameworks}go,"
    echo "$cmd" | grep -qw 'ruby' && frameworks="${frameworks}ruby,"
    echo "$cmd" | grep -qw 'rails' && frameworks="${frameworks}rails/ruby,"
    echo "$cmd" | grep -qw 'bundle' && frameworks="${frameworks}bundler/ruby,"
    echo "$cmd" | grep -qw 'kubectl' && frameworks="${frameworks}kubectl/k8s,"
    echo "$cmd" | grep -qw 'helm' && frameworks="${frameworks}helm/k8s,"
    echo "$cmd" | grep -qw 'terraform' && frameworks="${frameworks}terraform,"
    echo "$cmd" | grep -qw 'aws' && frameworks="${frameworks}aws,"
    echo "$cmd" | grep -qw 'gcloud' && frameworks="${frameworks}gcloud,"
    echo "$cmd" | grep -qw 'az' && frameworks="${frameworks}azure,"
    echo "$cmd" | grep -qw 'curl' && frameworks="${frameworks}curl/http,"
    echo "$cmd" | grep -qw 'wget' && frameworks="${frameworks}wget/http,"
    echo "$cmd" | grep -qw 'psql' && frameworks="${frameworks}psql/postgres,"
    echo "$cmd" | grep -qw 'mysql' && frameworks="${frameworks}mysql,"
    echo "$cmd" | grep -qw 'sqlite3' && frameworks="${frameworks}sqlite,"
    echo "$cmd" | grep -qw 'make' && frameworks="${frameworks}make,"
    echo "$cmd" | grep -qw 'cmake' && frameworks="${frameworks}cmake,"
    echo "$cmd" | grep -qw 'fly' && frameworks="${frameworks}fly.io,"
    echo "$cmd" | grep -qw 'vercel' && frameworks="${frameworks}vercel,"
    echo "$cmd" | grep -qw 'netlify' && frameworks="${frameworks}netlify,"
    echo "$cmd" | grep -qw 'lazy' && frameworks="${frameworks}lazy-fetch,"
    # Strip trailing comma
    echo "${frameworks%,}"
}

# --- Ensure DB exists with schema ---
ensure_db() {
    mkdir -p "$DB_DIR" 2>/dev/null || true
    if [ ! -f "$DB_PATH" ]; then
        sqlite3 "$DB_PATH" <<'SCHEMA'
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

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

CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_events_session ON tool_events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON tool_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_events_tool ON tool_events(tool_name);
CREATE INDEX IF NOT EXISTS idx_events_file ON tool_events(file_path);
CREATE INDEX IF NOT EXISTS idx_events_session_tool ON tool_events(session_id, tool_name);
CREATE INDEX IF NOT EXISTS idx_summaries_date ON daily_summaries(date);
CREATE INDEX IF NOT EXISTS idx_summaries_project ON daily_summaries(project);
CREATE INDEX IF NOT EXISTS idx_file_activity_path ON file_activity(file_path);
CREATE INDEX IF NOT EXISTS idx_file_activity_project ON file_activity(project);
CREATE INDEX IF NOT EXISTS idx_file_activity_date ON file_activity(date);

CREATE TABLE IF NOT EXISTS insights (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT REFERENCES sessions(id),
    project TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('progress','decision','pattern','fix','context','blocked')),
    content TEXT NOT NULL,
    reasoning TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_insights_project ON insights(project);
CREATE INDEX IF NOT EXISTS idx_insights_type ON insights(type);
CREATE INDEX IF NOT EXISTS idx_insights_session ON insights(session_id);
CREATE INDEX IF NOT EXISTS idx_insights_created ON insights(created_at);

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

CREATE INDEX IF NOT EXISTS idx_runs_project ON blueprint_runs(project);
CREATE INDEX IF NOT EXISTS idx_runs_status ON blueprint_runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_started ON blueprint_runs(started_at);
CREATE INDEX IF NOT EXISTS idx_runs_blueprint ON blueprint_runs(blueprint);
CREATE INDEX IF NOT EXISTS idx_runs_session ON blueprint_runs(session_id);

INSERT OR IGNORE INTO schema_version (version) VALUES (4);
SCHEMA
    else
        # Migrate existing DB: add insights table if missing
        sqlite3 "$DB_PATH" "CREATE TABLE IF NOT EXISTS insights (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT REFERENCES sessions(id),
            project TEXT NOT NULL,
            type TEXT NOT NULL CHECK(type IN ('progress','decision','pattern','fix','context','blocked')),
            content TEXT NOT NULL,
            reasoning TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );" 2>/dev/null || true
        sqlite3 "$DB_PATH" "CREATE INDEX IF NOT EXISTS idx_insights_project ON insights(project);" 2>/dev/null || true
        sqlite3 "$DB_PATH" "CREATE INDEX IF NOT EXISTS idx_insights_type ON insights(type);" 2>/dev/null || true
        sqlite3 "$DB_PATH" "CREATE INDEX IF NOT EXISTS idx_insights_session ON insights(session_id);" 2>/dev/null || true
        sqlite3 "$DB_PATH" "CREATE INDEX IF NOT EXISTS idx_insights_created ON insights(created_at);" 2>/dev/null || true
        # v3 migration: audit columns
        sqlite3 "$DB_PATH" "ALTER TABLE sessions ADD COLUMN user TEXT;" 2>/dev/null || true
        sqlite3 "$DB_PATH" "ALTER TABLE sessions ADD COLUMN hostname TEXT;" 2>/dev/null || true
        sqlite3 "$DB_PATH" "ALTER TABLE tool_events ADD COLUMN diff_content TEXT;" 2>/dev/null || true
        # v4 migration: project_path on sessions + blueprint_runs table
        sqlite3 "$DB_PATH" "ALTER TABLE sessions ADD COLUMN project_path TEXT;" 2>/dev/null || true
        sqlite3 "$DB_PATH" "CREATE TABLE IF NOT EXISTS blueprint_runs (
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
            source_file TEXT NOT NULL,
            source_mtime INTEGER NOT NULL,
            ingested_at TEXT NOT NULL DEFAULT (datetime('now'))
        );" 2>/dev/null || true
        sqlite3 "$DB_PATH" "CREATE INDEX IF NOT EXISTS idx_runs_project ON blueprint_runs(project);" 2>/dev/null || true
        sqlite3 "$DB_PATH" "CREATE INDEX IF NOT EXISTS idx_runs_status ON blueprint_runs(status);" 2>/dev/null || true
        sqlite3 "$DB_PATH" "CREATE INDEX IF NOT EXISTS idx_runs_started ON blueprint_runs(started_at);" 2>/dev/null || true
        sqlite3 "$DB_PATH" "CREATE INDEX IF NOT EXISTS idx_runs_blueprint ON blueprint_runs(blueprint);" 2>/dev/null || true
        sqlite3 "$DB_PATH" "ALTER TABLE blueprint_runs ADD COLUMN session_id TEXT;" 2>/dev/null || true
        sqlite3 "$DB_PATH" "CREATE INDEX IF NOT EXISTS idx_runs_session ON blueprint_runs(session_id);" 2>/dev/null || true
    fi
    # Ensure WAL mode on existing DB
    sqlite3 "$DB_PATH" "PRAGMA journal_mode=WAL;" >/dev/null 2>&1 || true
}

# --- SQL helper: escape single quotes ---
sql_escape() {
    echo "$1" | sed "s/'/''/g"
}

# --- Timestamp ---
NOW="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
TODAY="$(date -u '+%Y-%m-%d')"

# =============================================================================
# EVENT HANDLERS
# =============================================================================

handle_session_start() {
    ensure_db

    # Create session row
    local esc_project esc_project_path
    esc_project="$(sql_escape "$PROJECT")"
    esc_project_path="$(sql_escape "$PROJECT_PATH")"
    sqlite3 "$DB_PATH" "INSERT OR IGNORE INTO sessions (id, project, project_path, started_at, status, user, hostname) VALUES ('$(sql_escape "$SESSION_ID")', '$esc_project', '$esc_project_path', '$NOW', 'active', '$(sql_escape "$PULSE_USER")', '$(sql_escape "$PULSE_HOSTNAME")');" 2>/dev/null || true
    sqlite3 "$DB_PATH" "UPDATE sessions SET project_path='$esc_project_path' WHERE id='$(sql_escape "$SESSION_ID")' AND (project_path IS NULL OR project_path='');" 2>/dev/null || true

    # Create session tmp dir
    mkdir -p "$SESSION_DIR" 2>/dev/null || true

    # Output context injection — rich project context load (runs once per session)
    local ctx=""
    local esc_sid
    esc_sid="$(sql_escape "$SESSION_ID")"

    # --- Section 1: Project Identity ---
    ctx="PROJECT: ${PROJECT}\n"

    # --- Section 2: Recent Session Summaries (last 5) ---
    local session_history
    session_history="$(sqlite3 "$DB_PATH" "
        SELECT datetime(started_at, 'localtime') || ' (' || COALESCE(CAST(duration_seconds/60 AS TEXT) || 'min', '?') || '): ' || COALESCE(summary, '(no summary)')
        FROM sessions
        WHERE project='$esc_project' AND status='completed' AND summary IS NOT NULL AND summary != ''
        ORDER BY ended_at DESC LIMIT 5;
    " 2>/dev/null)" || true

    if [ -n "$session_history" ]; then
        ctx="${ctx}\nRECENT SESSIONS:\n${session_history}\n"
    fi

    # --- Section 3: All Insights (progress, decisions, blockers, patterns, fixes) ---
    # Progress & decisions: last 10
    local progress_decisions
    progress_decisions="$(sqlite3 "$DB_PATH" "
        SELECT '[' || type || '] ' || content
        FROM insights
        WHERE project='$esc_project' AND type IN ('progress','decision')
        ORDER BY created_at DESC LIMIT 10;
    " 2>/dev/null)" || true

    if [ -n "$progress_decisions" ]; then
        ctx="${ctx}\nPROGRESS & DECISIONS:\n${progress_decisions}\n"
    fi

    # Active blockers (not yet resolved — last 5)
    local blockers
    blockers="$(sqlite3 "$DB_PATH" "
        SELECT content FROM insights
        WHERE project='$esc_project' AND type='blocked'
        ORDER BY created_at DESC LIMIT 5;
    " 2>/dev/null)" || true

    if [ -n "$blockers" ]; then
        ctx="${ctx}\nBLOCKERS:\n${blockers}\n"
    fi

    # Knowledge: patterns, fixes, context (all — these are explicitly stored)
    local knowledge
    knowledge="$(sqlite3 "$DB_PATH" "
        SELECT '[' || type || '] ' || content
        FROM insights
        WHERE project='$esc_project' AND type IN ('pattern','fix','context')
        ORDER BY created_at DESC LIMIT 10;
    " 2>/dev/null)" || true

    if [ -n "$knowledge" ]; then
        ctx="${ctx}\nKNOWLEDGE:\n${knowledge}\n"
    fi

    # --- Section 4: Most Active Files (by edit frequency, last 14 days) ---
    local top_files
    top_files="$(sqlite3 "$DB_PATH" "
        SELECT REPLACE(file_path, '$(sql_escape "$CWD")/', '') || ' (' || SUM(edit_count) || ' edits, +' || SUM(lines_added) || '/-' || SUM(lines_removed) || ')'
        FROM file_activity
        WHERE project='$esc_project' AND date >= date('now', '-14 days')
        GROUP BY file_path
        ORDER BY SUM(edit_count) DESC LIMIT 10;
    " 2>/dev/null)" || true

    if [ -n "$top_files" ]; then
        ctx="${ctx}\nMOST ACTIVE FILES (14d):\n${top_files}\n"
    fi

    # --- Section 5: Today's Stats ---
    local today_stats
    today_stats="$(sqlite3 "$DB_PATH" "SELECT COUNT(DISTINCT s.id), COUNT(e.id) FROM sessions s LEFT JOIN tool_events e ON e.session_id=s.id WHERE date(s.started_at)='$TODAY';" 2>/dev/null)" || true

    if [ -n "$today_stats" ]; then
        local sess_count evt_count
        sess_count="$(echo "$today_stats" | cut -d'|' -f1)"
        evt_count="$(echo "$today_stats" | cut -d'|' -f2)"
        if [ "$sess_count" -gt 0 ] 2>/dev/null; then
            ctx="${ctx}\nTODAY: ${sess_count} sessions, ${evt_count} tool events.\n"
        fi
    fi

    # --- Section 6: Recent Failures (last session) ---
    local recent_failures
    recent_failures="$(sqlite3 "$DB_PATH" "
        SELECT command FROM tool_events
        WHERE session_id=(SELECT id FROM sessions WHERE project='$esc_project' AND status='completed' ORDER BY ended_at DESC LIMIT 1)
        AND tool_name='Bash' AND command_failed=1
        ORDER BY timestamp DESC LIMIT 3;
    " 2>/dev/null)" || true

    if [ -n "$recent_failures" ]; then
        local fail_list
        fail_list="$(echo "$recent_failures" | head -3 | sed 's/^/  /')"
        ctx="${ctx}\nLAST SESSION FAILURES:\n${fail_list}\n"
    fi

    # --- Section 7: Cross-project awareness ---
    local other_projects
    other_projects="$(sqlite3 "$DB_PATH" "
        SELECT DISTINCT project FROM sessions
        WHERE date(started_at) >= date('now', '-3 days')
        AND project != '$esc_project'
        ORDER BY started_at DESC LIMIT 5;
    " 2>/dev/null)" || true

    if [ -n "$other_projects" ]; then
        local proj_list
        proj_list="$(echo "$other_projects" | tr '\n' ', ' | sed 's/,$//')"
        ctx="${ctx}\nOTHER ACTIVE PROJECTS: ${proj_list}\n"
    fi

    if [ -n "$ctx" ]; then
        # Use jq to safely build JSON with newlines preserved
        printf '%s' "$ctx" | jq -Rs '{
            hookSpecificOutput: {
                additionalContext: ("[Claude Pulse] " + . + "\nUse /pulse-latest, /pulse-projects, or /pulse-insights to query cross-project data.")
            }
        }' 2>/dev/null || \
        printf '{"hookSpecificOutput":{"additionalContext":"[Claude Pulse] PROJECT: %s. Use /pulse-latest, /pulse-projects, or /pulse-insights to query cross-project data."}}' "$(echo "$PROJECT" | sed 's/"/\\"/g')"
    fi
}

# =============================================================================
# USER PROMPT HANDLER — lightweight per-prompt project identity beacon
# =============================================================================

handle_user_prompt() {
    # Ultra-lean: ~30-40 tokens. Just enough for Claude to catch wrong-terminal usage.
    # Must be FAST — runs on every user message.

    [ ! -f "$DB_PATH" ] && return

    local esc_project
    esc_project="$(sql_escape "$PROJECT")"

    # Get current focus: last 3 progress/decision insights (compact, one line each)
    local focus
    focus="$(sqlite3 "$DB_PATH" "
        SELECT content FROM insights
        WHERE project='$esc_project' AND type IN ('progress','decision')
        ORDER BY created_at DESC LIMIT 2;
    " 2>/dev/null)" || true

    local focus_short=""
    if [ -n "$focus" ]; then
        # Truncate each line to 60 chars, join with semicolons
        focus_short="$(echo "$focus" | head -2 | cut -c1-60 | tr '\n' '; ' | sed 's/; $//')"
    fi

    local beacon="[Pulse] project=${PROJECT}"
    if [ -n "$focus_short" ]; then
        beacon="${beacon} | focus: ${focus_short}"
    fi

    printf '{"hookSpecificOutput":{"additionalContext":"%s"}}' "$(echo "$beacon" | sed 's/"/\\"/g')"
}

handle_tool_event() {
    ensure_db

    # Ensure session exists (in case session-start was missed)
    local esc_project esc_project_path
    esc_project="$(sql_escape "$PROJECT")"
    esc_project_path="$(sql_escape "$PROJECT_PATH")"
    sqlite3 "$DB_PATH" "INSERT OR IGNORE INTO sessions (id, project, project_path, started_at, status, user, hostname) VALUES ('$(sql_escape "$SESSION_ID")', '$esc_project', '$esc_project_path', '$NOW', 'active', '$(sql_escape "$PULSE_USER")', '$(sql_escape "$PULSE_HOSTNAME")');" 2>/dev/null || true
    sqlite3 "$DB_PATH" "UPDATE sessions SET project_path='$esc_project_path' WHERE id='$(sql_escape "$SESSION_ID")' AND (project_path IS NULL OR project_path='');" 2>/dev/null || true

    # Parse tool-specific fields
    local file_path="" language="" lines_added=0 lines_removed=0
    local command="" framework="" command_failed=0
    local search_pattern="" agent_type="" agent_desc=""
    local skill_name="" skill_args="" metadata="{}"

    local tool_input
    tool_input="$(echo "$INPUT" | jq -c '.tool_input // {}' 2>/dev/null)" || tool_input="{}"

    case "$TOOL_NAME" in
        Edit)
            file_path="$(echo "$tool_input" | jq -r '.file_path // empty' 2>/dev/null)" || true
            language="$(detect_language "$file_path")"
            local old_str new_str old_lines new_lines
            old_str="$(echo "$tool_input" | jq -r '.old_string // empty' 2>/dev/null)" || true
            new_str="$(echo "$tool_input" | jq -r '.new_string // empty' 2>/dev/null)" || true
            if [ -n "$old_str" ]; then
                old_lines="$(echo "$old_str" | wc -l | tr -d ' ')"
            else
                old_lines=0
            fi
            if [ -n "$new_str" ]; then
                new_lines="$(echo "$new_str" | wc -l | tr -d ' ')"
            else
                new_lines=0
            fi
            lines_removed=$old_lines
            lines_added=$new_lines

            # Capture diff for audit trail (truncate at 2KB)
            local diff_text=""
            if [ -n "$old_str" ] || [ -n "$new_str" ]; then
                diff_text="$(printf '--- old\n%s\n+++ new\n%s' "$(echo "$old_str" | head -c 1024)" "$(echo "$new_str" | head -c 1024)")"
            fi

            # Upsert file_activity
            sqlite3 "$DB_PATH" "INSERT INTO file_activity (file_path, project, date, edit_count, lines_added, lines_removed, language)
                VALUES ('$(sql_escape "$file_path")', '$esc_project', '$TODAY', 1, $lines_added, $lines_removed, '$(sql_escape "$language")')
                ON CONFLICT(file_path, project, date) DO UPDATE SET
                    edit_count = edit_count + 1,
                    lines_added = lines_added + $lines_added,
                    lines_removed = lines_removed + $lines_removed;" 2>/dev/null || true
            ;;

        Write)
            file_path="$(echo "$tool_input" | jq -r '.file_path // empty' 2>/dev/null)" || true
            language="$(detect_language "$file_path")"
            local content
            content="$(echo "$tool_input" | jq -r '.content // empty' 2>/dev/null)" || true
            if [ -n "$content" ]; then
                lines_added="$(echo "$content" | wc -l | tr -d ' ')"
            fi

            # Upsert file_activity
            sqlite3 "$DB_PATH" "INSERT INTO file_activity (file_path, project, date, write_count, lines_added, language)
                VALUES ('$(sql_escape "$file_path")', '$esc_project', '$TODAY', 1, $lines_added, '$(sql_escape "$language")')
                ON CONFLICT(file_path, project, date) DO UPDATE SET
                    write_count = write_count + 1,
                    lines_added = lines_added + $lines_added;" 2>/dev/null || true
            ;;

        Bash)
            command="$(echo "$tool_input" | jq -r '.command // empty' 2>/dev/null)" || true
            framework="$(detect_frameworks "$command")"
            # Check if command failed — Claude Code uses tool_response (not tool_output)
            local exit_code
            exit_code="$(echo "$INPUT" | jq -r '.tool_response.exit_code // .tool_output.exit_code // 0' 2>/dev/null)" || exit_code=0
            if [ "$exit_code" != "0" ] && [ "$exit_code" != "null" ] && [ -n "$exit_code" ]; then
                command_failed=1
            fi
            ;;

        Read)
            file_path="$(echo "$tool_input" | jq -r '.file_path // empty' 2>/dev/null)" || true
            language="$(detect_language "$file_path")"

            # Upsert file_activity
            if [ -n "$file_path" ]; then
                sqlite3 "$DB_PATH" "INSERT INTO file_activity (file_path, project, date, read_count, language)
                    VALUES ('$(sql_escape "$file_path")', '$esc_project', '$TODAY', 1, '$(sql_escape "$language")')
                    ON CONFLICT(file_path, project, date) DO UPDATE SET
                        read_count = read_count + 1;" 2>/dev/null || true
            fi
            ;;

        Glob|Grep)
            search_pattern="$(echo "$tool_input" | jq -r '.pattern // empty' 2>/dev/null)" || true
            ;;

        Agent)
            agent_type="$(echo "$tool_input" | jq -r '.type // .agent_type // empty' 2>/dev/null)" || true
            agent_desc="$(echo "$tool_input" | jq -r '.description // .prompt // empty' 2>/dev/null)" || true
            ;;

        Skill)
            skill_name="$(echo "$tool_input" | jq -r '.skill // .name // empty' 2>/dev/null)" || true
            skill_args="$(echo "$tool_input" | jq -r '.args // empty' 2>/dev/null)" || true
            ;;
    esac

    # Insert tool event (with optional diff content for audit trail)
    sqlite3 "$DB_PATH" "INSERT INTO tool_events (
        session_id, tool_name, timestamp, file_path, language,
        lines_added, lines_removed, command, detected_framework,
        command_failed, search_pattern, agent_type, agent_description,
        skill_name, skill_args, metadata, diff_content
    ) VALUES (
        '$(sql_escape "$SESSION_ID")',
        '$(sql_escape "$TOOL_NAME")',
        '$NOW',
        '$(sql_escape "$file_path")',
        '$(sql_escape "$language")',
        $lines_added,
        $lines_removed,
        '$(sql_escape "$command")',
        '$(sql_escape "$framework")',
        $command_failed,
        '$(sql_escape "$search_pattern")',
        '$(sql_escape "$agent_type")',
        '$(sql_escape "$agent_desc")',
        '$(sql_escape "$skill_name")',
        '$(sql_escape "$skill_args")',
        '$(sql_escape "$metadata")',
        '$(sql_escape "${diff_text:-}")'
    );" 2>/dev/null || true

    # Hotspot detection only — no per-tool summaries (Claude writes its own summary at session end)
    if [ "$TOOL_NAME" = "Edit" ] || [ "$TOOL_NAME" = "Write" ]; then
        if [ -n "$file_path" ]; then
            local edit_count
            edit_count="$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM tool_events WHERE session_id='$(sql_escape "$SESSION_ID")' AND file_path='$(sql_escape "$file_path")' AND tool_name IN ('Edit','Write');" 2>/dev/null)" || edit_count=0
            if [ "$edit_count" -ge 20 ] 2>/dev/null; then
                printf '{"hookSpecificOutput":{"additionalContext":"Hotspot: %s has been edited %s times this session. Consider refactoring or splitting."}}' "$(basename "$file_path")" "$edit_count"
            fi
        fi
    fi
}

handle_session_stop() {
    ensure_db

    local status="completed"
    if [ "$HOOK_TYPE" = "StopFailure" ]; then
        status="crashed"
    fi

    local esc_sid
    esc_sid="$(sql_escape "$SESSION_ID")"
    local esc_project
    esc_project="$(sql_escape "$PROJECT")"

    # --- Smart gating: skip summary for trivial/read-only sessions ---
    local summary_guard="/tmp/claude-pulse-summary-${SESSION_ID}"
    local last_msg
    last_msg="$(echo "$INPUT" | jq -r '.last_assistant_message // empty' 2>/dev/null)" || true

    if [ ! -f "$summary_guard" ] && [ "$status" != "crashed" ]; then
        # Check if session had any write activity (Edit/Write/Bash with changes)
        local write_events=0
        write_events="$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM tool_events WHERE session_id='$esc_sid' AND tool_name IN ('Edit','Write','Bash','Agent');" 2>/dev/null)" || write_events=0

        if [ "$write_events" -le 2 ] 2>/dev/null; then
            # Trivial session — skip summary, just close
            # Still record a minimal auto-summary
            local event_count=0
            event_count="$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM tool_events WHERE session_id='$esc_sid';" 2>/dev/null)" || event_count=0
            local auto_summary="[auto] Read-only session: ${event_count} events, no significant changes."
            sqlite3 "$DB_PATH" "UPDATE sessions SET summary='$(sql_escape "$auto_summary")' WHERE id='$esc_sid';" 2>/dev/null || true
        else
            # Meaningful session — block once, ask for structured summary
            touch "$summary_guard" 2>/dev/null || true

            local prompt="Session ending for ${PROJECT}. Respond with ONLY these lines (skip empty categories):\nPROGRESS: <what was accomplished, 1 line>\nDECISION: <key choice and why> (repeat if multiple)\nBLOCKED: <what's stuck or left to do>"
            printf '{"decision":"block","reason":"%s"}' "$(echo "$prompt" | sed 's/"/\\"/g')"
            exit 0
        fi
    fi

    # Second Stop (after summary): parse structured response into insights
    if [ -f "$summary_guard" ] && [ -n "$last_msg" ] && [ ${#last_msg} -gt 5 ]; then
        # Store full summary on session (backward compat)
        local summary_text
        summary_text="$(echo "$last_msg" | head -c 500)"
        sqlite3 "$DB_PATH" "UPDATE sessions SET summary='$(sql_escape "$summary_text")' WHERE id='$esc_sid';" 2>/dev/null || true

        # Parse structured lines into insights table
        local line type content reasoning
        echo "$last_msg" | while IFS= read -r line; do
            type="" content="" reasoning=""
            case "$line" in
                PROGRESS:*)
                    type="progress"
                    content="${line#PROGRESS: }"
                    content="${content#PROGRESS:}"
                    ;;
                DECISION:*)
                    type="decision"
                    content="${line#DECISION: }"
                    content="${content#DECISION:}"
                    ;;
                BLOCKED:*)
                    type="blocked"
                    content="${line#BLOCKED: }"
                    content="${content#BLOCKED:}"
                    ;;
                PATTERN:*)
                    type="pattern"
                    content="${line#PATTERN: }"
                    content="${content#PATTERN:}"
                    ;;
                FIX:*)
                    type="fix"
                    content="${line#FIX: }"
                    content="${content#FIX:}"
                    ;;
            esac
            if [ -n "$type" ] && [ -n "$content" ]; then
                sqlite3 "$DB_PATH" "INSERT INTO insights (session_id, project, type, content, created_at)
                    VALUES ('$esc_sid', '$esc_project', '$type', '$(sql_escape "$content")', '$NOW');" 2>/dev/null || true
            fi
        done
    fi

    # Clean up guard file
    rm -f "$summary_guard" 2>/dev/null || true

    # Calculate duration
    local start_time duration=0
    start_time="$(sqlite3 "$DB_PATH" "SELECT started_at FROM sessions WHERE id='$(sql_escape "$SESSION_ID")';" 2>/dev/null)" || true

    if [ -n "$start_time" ]; then
        local start_epoch end_epoch
        if date -j -f "%Y-%m-%dT%H:%M:%SZ" "$start_time" "+%s" >/dev/null 2>&1; then
            # macOS
            start_epoch="$(date -j -f "%Y-%m-%dT%H:%M:%SZ" "$start_time" "+%s" 2>/dev/null)" || start_epoch=0
        else
            # GNU/Linux
            start_epoch="$(date -d "$start_time" "+%s" 2>/dev/null)" || start_epoch=0
        fi
        end_epoch="$(date -u "+%s")"
        if [ "$start_epoch" -gt 0 ] 2>/dev/null; then
            duration=$(( end_epoch - start_epoch ))
        fi
    fi

    # Update session row
    sqlite3 "$DB_PATH" "UPDATE sessions SET
        ended_at='$NOW',
        duration_seconds=$duration,
        status='$status'
        WHERE id='$(sql_escape "$SESSION_ID")';" 2>/dev/null || true

    # Compute and upsert daily_summaries — one row PER DAY that had tool activity.
    # This handles multi-day sessions correctly (e.g. started Mon, closed Wed).
    local esc_project
    esc_project="$(sql_escape "$PROJECT")"
    local esc_sid
    esc_sid="$(sql_escape "$SESSION_ID")"

    # Get all distinct dates that had tool_events in this session
    local event_dates
    event_dates="$(sqlite3 "$DB_PATH" "SELECT DISTINCT date(timestamp) FROM tool_events WHERE session_id='$esc_sid' ORDER BY date(timestamp);" 2>/dev/null)" || true

    # Fallback: if no tool_events, use session start date
    if [ -z "$event_dates" ]; then
        event_dates="$(sqlite3 "$DB_PATH" "SELECT date(started_at) FROM sessions WHERE id='$esc_sid';" 2>/dev/null)" || event_dates="$TODAY"
    fi

    # Loop over each day and upsert its daily_summary
    echo "$event_dates" | while IFS= read -r event_date; do
        [ -z "$event_date" ] && continue
        local esc_date
        esc_date="$(sql_escape "$event_date")"

        # Build per-day JSON aggregation fields
        local skills_json frameworks_json languages_json tool_counts_json

        skills_json="$(sqlite3 "$DB_PATH" "
            SELECT '{' || GROUP_CONCAT('\"' || REPLACE(skill_name, '\"', '\\\"') || '\":' || cnt) || '}'
            FROM (SELECT skill_name, COUNT(*) as cnt FROM tool_events
                  WHERE session_id='$esc_sid' AND date(timestamp)='$esc_date'
                  AND skill_name IS NOT NULL AND skill_name != ''
                  GROUP BY skill_name ORDER BY cnt DESC);
        " 2>/dev/null)" || skills_json="{}"
        [ -z "$skills_json" ] || [ "$skills_json" = "{null}" ] && skills_json="{}"

        frameworks_json="$(sqlite3 "$DB_PATH" "
            SELECT '{' || GROUP_CONCAT('\"' || REPLACE(fw, '\"', '\\\"') || '\":' || cnt) || '}'
            FROM (
                SELECT TRIM(value) as fw, COUNT(*) as cnt
                FROM tool_events, json_each('[\"' || REPLACE(REPLACE(detected_framework, ',', '\",\"'), ' ', '') || '\"]')
                WHERE session_id='$esc_sid' AND date(timestamp)='$esc_date'
                AND detected_framework IS NOT NULL AND detected_framework != ''
                AND TRIM(value) != ''
                GROUP BY fw ORDER BY cnt DESC
            );
        " 2>/dev/null)" || frameworks_json="{}"
        [ -z "$frameworks_json" ] || [ "$frameworks_json" = "{null}" ] && frameworks_json="{}"

        languages_json="$(sqlite3 "$DB_PATH" "
            SELECT '{' || GROUP_CONCAT('\"' || REPLACE(language, '\"', '\\\"') || '\":' || cnt) || '}'
            FROM (SELECT language, COUNT(*) as cnt FROM tool_events
                  WHERE session_id='$esc_sid' AND date(timestamp)='$esc_date'
                  AND language IS NOT NULL AND language != '' AND language != 'Unknown'
                  GROUP BY language ORDER BY cnt DESC);
        " 2>/dev/null)" || languages_json="{}"
        [ -z "$languages_json" ] || [ "$languages_json" = "{null}" ] && languages_json="{}"

        tool_counts_json="$(sqlite3 "$DB_PATH" "
            SELECT '{' || GROUP_CONCAT('\"' || tool_name || '\":' || cnt) || '}'
            FROM (SELECT tool_name, COUNT(*) as cnt FROM tool_events
                  WHERE session_id='$esc_sid' AND date(timestamp)='$esc_date'
                  GROUP BY tool_name ORDER BY cnt DESC);
        " 2>/dev/null)" || tool_counts_json="{}"
        [ -z "$tool_counts_json" ] || [ "$tool_counts_json" = "{null}" ] && tool_counts_json="{}"

        sqlite3 "$DB_PATH" "
        INSERT INTO daily_summaries (date, project, session_count, total_duration_seconds,
            lines_added, lines_removed, net_lines, files_created, files_edited, files_read,
            tool_calls, bash_commands, bash_failures, searches, agents_spawned,
            skills_used, frameworks_detected, languages, tool_counts)
        SELECT
            '$esc_date',
            '$esc_project',
            (SELECT COUNT(*) FROM sessions WHERE project='$esc_project' AND date(started_at)='$esc_date' AND status IN ('completed','crashed')),
            (SELECT COALESCE(SUM(duration_seconds),0) FROM sessions WHERE project='$esc_project' AND date(started_at)='$esc_date'),
            COALESCE(SUM(lines_added),0),
            COALESCE(SUM(lines_removed),0),
            COALESCE(SUM(lines_added),0) - COALESCE(SUM(lines_removed),0),
            (SELECT COUNT(DISTINCT file_path) FROM tool_events WHERE session_id='$esc_sid' AND date(timestamp)='$esc_date' AND tool_name='Write'),
            (SELECT COUNT(DISTINCT file_path) FROM tool_events WHERE session_id='$esc_sid' AND date(timestamp)='$esc_date' AND tool_name='Edit'),
            (SELECT COUNT(DISTINCT file_path) FROM tool_events WHERE session_id='$esc_sid' AND date(timestamp)='$esc_date' AND tool_name='Read'),
            COUNT(*),
            (SELECT COUNT(*) FROM tool_events WHERE session_id='$esc_sid' AND date(timestamp)='$esc_date' AND tool_name='Bash'),
            (SELECT COUNT(*) FROM tool_events WHERE session_id='$esc_sid' AND date(timestamp)='$esc_date' AND tool_name='Bash' AND command_failed=1),
            (SELECT COUNT(*) FROM tool_events WHERE session_id='$esc_sid' AND date(timestamp)='$esc_date' AND tool_name IN ('Glob','Grep')),
            (SELECT COUNT(*) FROM tool_events WHERE session_id='$esc_sid' AND date(timestamp)='$esc_date' AND tool_name='Agent'),
            '$(sql_escape "$skills_json")',
            '$(sql_escape "$frameworks_json")',
            '$(sql_escape "$languages_json")',
            '$(sql_escape "$tool_counts_json")'
        FROM tool_events WHERE session_id='$esc_sid' AND date(timestamp)='$esc_date'
        ON CONFLICT(date, project) DO UPDATE SET
            session_count = excluded.session_count,
            total_duration_seconds = excluded.total_duration_seconds,
            lines_added = daily_summaries.lines_added + excluded.lines_added,
            lines_removed = daily_summaries.lines_removed + excluded.lines_removed,
            net_lines = daily_summaries.net_lines + excluded.net_lines,
            files_created = daily_summaries.files_created + excluded.files_created,
            files_edited = daily_summaries.files_edited + excluded.files_edited,
            files_read = daily_summaries.files_read + excluded.files_read,
            tool_calls = daily_summaries.tool_calls + excluded.tool_calls,
            bash_commands = daily_summaries.bash_commands + excluded.bash_commands,
            bash_failures = daily_summaries.bash_failures + excluded.bash_failures,
            searches = daily_summaries.searches + excluded.searches,
            agents_spawned = daily_summaries.agents_spawned + excluded.agents_spawned,
            skills_used = excluded.skills_used,
            frameworks_detected = excluded.frameworks_detected,
            languages = excluded.languages,
            tool_counts = excluded.tool_counts;
        " 2>/dev/null || true
    done

    # Clean up tmp dir
    rm -rf "$SESSION_DIR" 2>/dev/null || true
}

# =============================================================================
# EVENT ROUTING
# =============================================================================

case "$HOOK_TYPE" in
    SessionStart)
        handle_session_start
        ;;
    UserPromptSubmit)
        handle_user_prompt
        ;;
    PostToolUse)
        handle_tool_event
        ;;
    Stop|StopFailure)
        handle_session_stop
        ;;
    TaskCreated|CwdChanged|PreCompact)
        # Acknowledge but no special handling yet
        ensure_db
        ;;
    *)
        # Unknown hook type, silently ignore
        ;;
esac

exit 0
