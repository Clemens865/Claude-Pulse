# Claude Pulse

**One command. Global memory for Claude Code.**

```bash
npx claude-pulse init
```

Claude Pulse captures every session, every decision, and every line of code across all your projects — automatically, locally, and queryable anytime. It gives Claude Code a persistent memory and gives you a dashboard to see your work.

No cloud. No accounts. No data leaves your machine.

![Next.js](https://img.shields.io/badge/Next.js-16-black)
![SQLite](https://img.shields.io/badge/SQLite-WAL-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## What it does

| Feature | How it works |
|---------|-------------|
| **Session tracking** | Every start, stop, and tool call recorded automatically |
| **Code metrics** | Lines added/removed per file, per session, per day |
| **Brain layer** | Structured progress, decisions, and blockers captured at session end |
| **Smart gating** | Only asks for summaries on meaningful sessions — trivial ones auto-close |
| **Cross-project context** | Claude knows what you did in other projects when you start a session |
| **Knowledge capture** | Store patterns, fixes, and context mid-session with `/pulse-remember` |
| **Audit trail** | User identity, diff capture, and exportable records for compliance |
| **Dashboard** | Visual overview at localhost:3141 — activity, brain, projects, timeline |

## How to set it up

### What you need

1. **Claude Code** ([install guide](https://docs.anthropic.com/en/docs/claude-code))
2. **Node.js 18+** ([nodejs.org](https://nodejs.org))
3. **jq** and **sqlite3**

```bash
# macOS
brew install jq sqlite3

# Ubuntu/Debian
sudo apt install jq sqlite3
```

### Install

#### Option A: Global install (recommended)

```bash
git clone https://github.com/Clemens865/Claude-Pulse.git
cd Claude-Pulse
npm install
npm run build && node bin/copy-static.mjs
npm link
claude-pulse init
```

Now `claude-pulse` works from any directory. Use Claude Code normally — everything is captured in the background.

#### Option B: Local install (use with npx)

```bash
git clone https://github.com/Clemens865/Claude-Pulse.git
cd Claude-Pulse
npm install
npx claude-pulse init
```

With a local install, prefix all commands with `npx` and run them from the project directory.

### View your dashboard

```bash
claude-pulse start    # global install
npx claude-pulse start  # local install
```

Open **http://localhost:3141**.

## The Dashboard

### Overview
Key numbers at a glance: total sessions, net lines written, hours spent, active projects, streaks. Daily activity for the last 14 days. Top tools, skills, and frameworks.

### Brain
A searchable timeline of your reasoning — not just your code. Structured entries for progress, decisions, blockers, patterns, and fixes. Filterable by type and project. This is the log of your thinking across sessions.

### Projects
All projects ranked by activity. Click any project for session history, most-edited files, daily breakdowns.

### Timeline
90-day GitHub-style heatmap. Darker squares = more active days.

### Session Detail
Full event-by-event replay of any session. Every edit shows an expandable diff view. User identity (who@hostname) displayed when available.

### Settings
Database info, record counts, and an export section with project/date filtering. Download your data as JSON or CSV anytime.

## Commands

### Terminal

| Command | What it does |
|---------|-------------|
| `claude-pulse init` | Set up hooks and database (safe to re-run) |
| `claude-pulse start` | Open the dashboard |
| `claude-pulse status` | Quick terminal summary |
| `claude-pulse doctor` | Health check — verify everything works |
| `claude-pulse export` | Export data as JSON, CSV, or NDJSON |
| `claude-pulse verify` | Audit integrity check |
| `claude-pulse uninstall` | Remove hooks (data preserved) |

> **Note:** If you installed locally (without `npm link`), prefix all commands with `npx`.

Export supports filtering:
```bash
claude-pulse export --format json --start 2026-03-01 --end 2026-03-31
claude-pulse export --format csv --table insights
```

### Slash commands (inside Claude Code)

These work globally — any project, any directory:

| Command | What it does |
|---------|-------------|
| `/pulse-projects` | List all tracked projects with stats |
| `/pulse-projects my-app` | Details and insights for a specific project |
| `/pulse-latest` | Last 3 days of work across all projects |
| `/pulse-latest 7` | Last 7 days |
| `/pulse-insights` | Overview of all insights |
| `/pulse-insights type:decision` | All decisions you've made |
| `/pulse-insights type:blocked` | All current blockers |
| `/pulse-insights auth` | Search insights by keyword |

### Remembering things

Some knowledge emerges mid-session. `/pulse-remember` captures it:

```
/pulse-remember fix: sqlite3 needs absolute paths on macOS
/pulse-remember pattern: all API routes use getDb() singleton
/pulse-remember context: deploy freeze next week for mobile release
```

Claude distills your input into a concise summary and stores both layers:
- **Content** — Claude's clean one-liner (shown in dashboard)
- **Reasoning** — your original words (preserved for context)

These show up as "Knowledge" at your next session start — before yesterday's progress, because accumulated knowledge is more valuable.

## Audit trail

Claude Pulse captures a complete activity trail suitable for AI code audits:

- **User identity** — every session records who (whoami) and where (hostname)
- **Diff capture** — edit events store the actual old/new content, viewable in the dashboard
- **Decision trail** — every DECISION insight is timestamped, project-tagged, and searchable
- **Export** — download filtered data as JSON or CSV from the dashboard or CLI
- **Integrity check** — `claude-pulse verify` reports record counts, coverage, and SQLite integrity

For teams asking "what did the AI do?" — Claude Pulse provides every action, every decision, timestamped and queryable.

## How it works

```
Claude Code session
       |
       v
Hook events (SessionStart, PostToolUse, Stop)
       |
       v
bash script + jq + sqlite3 → ~/.claude-pulse/tracker.db
       |
       v
Next.js dashboard (localhost:3141)
```

1. **`claude-pulse init`** registers three hooks in Claude Code's settings:
   - **SessionStart** — records session with user identity
   - **PostToolUse** — records each tool call with diffs (runs async, non-blocking)
   - **Stop** — finalizes session, computes summaries, captures structured insights

2. **Smart gating**: at session end, the hook counts write events. Fewer than 3? Auto-close silently. More? Ask Claude for a structured summary (PROGRESS/DECISION/BLOCKED).

3. **Context injection**: at session start, the hook injects last session's summary, accumulated knowledge, and cross-project awareness into Claude's context.

4. The dashboard reads the same SQLite file directly. No API keys, no cloud, no accounts.

## Troubleshooting

**No data showing up?** Run `claude-pulse doctor` — it checks deps, hooks, DB, and recent activity.

**jq or sqlite3 not found?** Install them (`brew install jq sqlite3` or `apt install jq sqlite3`), then re-run `claude-pulse init`.

**Dashboard won't start?** Check if port 3141 is in use: `lsof -i :3141`.

**Start fresh?** Delete the DB and re-init:
```bash
rm ~/.claude-pulse/tracker.db
npx claude-pulse init
```

**Remove completely:**
```bash
claude-pulse uninstall   # removes hooks
rm -rf ~/.claude-pulse        # removes data
```

## Database

SQLite with WAL mode at `~/.claude-pulse/tracker.db`:

| Table | What it stores |
|-------|---------------|
| `sessions` | Session lifecycle, user identity, summary |
| `tool_events` | Every tool call with timestamps, diffs, and metadata |
| `insights` | Typed entries: progress, decisions, patterns, fixes, blockers |
| `daily_summaries` | Pre-computed daily aggregates |
| `file_activity` | Per-file daily edit/read/write counts |

## For developers

### Tech stack
Next.js 16 + React 19 + Tailwind CSS 4 + better-sqlite3 + TypeScript 5.9 + bash/jq/sqlite3

### Development
```bash
npm run dev       # Dev server on port 3141
npm run build     # Production build
npm run lint      # ESLint
```

### Plugin structure
The repo also works as a Claude Code plugin:
- `.claude-plugin/plugin.json` — metadata
- `hooks/hooks.json` — auto-registered hooks
- `skills/` — slash commands

### Demo data
Visit Settings in the dashboard or POST to `/api/seed` for 30 days of sample data.

## License

MIT
