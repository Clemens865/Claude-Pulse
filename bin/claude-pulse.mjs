#!/usr/bin/env node

/**
 * Claude Pulse CLI
 *
 * Commands:
 *   init       Set up hooks and database
 *   start      Open the dashboard (alias: no args)
 *   status     Quick terminal summary
 *   uninstall  Remove hooks and optionally data
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, statSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PULSE_DIR = join(homedir(), ".claude-pulse");
const DB_PATH = join(PULSE_DIR, "tracker.db");
const HOOK_PATH = join(PULSE_DIR, "hook.sh");
const CONFIG_PATH = join(PULSE_DIR, "config.json");
const CLAUDE_SETTINGS = join(homedir(), ".claude", "settings.json");
const HOOK_SOURCE = join(__dirname, "..", "hook", "claude-pulse-hook.sh");

const command = process.argv[2] || "start";

function log(msg) {
  console.log(`  ${msg}`);
}

function logOk(msg) {
  console.log(`  [ok] ${msg}`);
}

function logWarn(msg) {
  console.log(`  [!!] ${msg}`);
}

// ─── INIT ───

function checkDeps() {
  const missing = [];
  try { execSync("which jq", { stdio: "pipe" }); } catch { missing.push("jq"); }
  try { execSync("which sqlite3", { stdio: "pipe" }); } catch { missing.push("sqlite3"); }
  if (missing.length > 0) {
    logWarn(`Missing dependencies: ${missing.join(", ")}`);
    log(`Install with: brew install ${missing.join(" ")} (macOS) or apt install ${missing.join(" ")} (Ubuntu)`);
    process.exit(1);
  }
  logOk("Dependencies found (jq, sqlite3)");
}

function setupDir() {
  if (!existsSync(PULSE_DIR)) {
    mkdirSync(PULSE_DIR, { recursive: true });
  }
  logOk(`Directory: ${PULSE_DIR}`);
}

function copyHook() {
  if (!existsSync(HOOK_SOURCE)) {
    logWarn(`Hook source not found at ${HOOK_SOURCE}`);
    return;
  }
  copyFileSync(HOOK_SOURCE, HOOK_PATH);
  execSync(`chmod +x "${HOOK_PATH}"`);
  logOk(`Hook installed: ${HOOK_PATH}`);
}

function writeConfig() {
  if (!existsSync(CONFIG_PATH)) {
    writeFileSync(CONFIG_PATH, JSON.stringify({ port: 3141, retention_days: 90 }, null, 2));
    logOk("Config created: config.json");
  }
}

function initDb() {
  if (!existsSync(DB_PATH)) {
    // Hook script creates tables on first run, just touch the file
    execSync(`sqlite3 "${DB_PATH}" "PRAGMA journal_mode=WAL;"`, { stdio: "pipe" });
    logOk("Database created with WAL mode");
  } else {
    logOk("Database already exists");
  }
}

function mergeHooks() {
  const claudeDir = join(homedir(), ".claude");
  if (!existsSync(claudeDir)) {
    mkdirSync(claudeDir, { recursive: true });
  }

  let settings = {};
  if (existsSync(CLAUDE_SETTINGS)) {
    // Backup first
    const backup = `${CLAUDE_SETTINGS}.backup-${Date.now()}`;
    copyFileSync(CLAUDE_SETTINGS, backup);
    logOk(`Backed up settings to ${backup}`);
    settings = JSON.parse(readFileSync(CLAUDE_SETTINGS, "utf-8"));
  }

  if (!settings.hooks) settings.hooks = {};

  const pulseHookCommand = `${HOOK_PATH}`;

  // Remove old Claude Pulse hooks before re-adding (supports upgrades)
  for (const event of Object.keys(settings.hooks)) {
    if (Array.isArray(settings.hooks[event])) {
      settings.hooks[event] = settings.hooks[event].filter(
        (entry) => !JSON.stringify(entry).includes("claude-pulse")
      );
      if (settings.hooks[event].length === 0) delete settings.hooks[event];
    }
  }

  // Add SessionStart hook
  // Claude Code pipes JSON on stdin with session_id, cwd, hook_event_name
  if (!settings.hooks.SessionStart) settings.hooks.SessionStart = [];
  settings.hooks.SessionStart.push({
    hooks: [{
      type: "command",
      command: pulseHookCommand,
      timeout: 5,
      statusMessage: "Claude Pulse: recording session..."
    }]
  });

  // Add PostToolUse hook (async — tracking doesn't need to block Claude)
  if (!settings.hooks.PostToolUse) settings.hooks.PostToolUse = [];
  settings.hooks.PostToolUse.push({
    matcher: "Write|Edit|Bash|Agent|Skill|Read|Glob|Grep|WebFetch|WebSearch|ToolSearch",
    hooks: [{
      type: "command",
      command: pulseHookCommand,
      timeout: 3,
      async: true,
      statusMessage: "Claude Pulse: tracking..."
    }]
  });

  // Add Stop hook (needs longer timeout for summary prompt flow)
  if (!settings.hooks.Stop) settings.hooks.Stop = [];
  settings.hooks.Stop.push({
    hooks: [{
      type: "command",
      command: pulseHookCommand,
      timeout: 10,
      statusMessage: "Claude Pulse: saving session..."
    }]
  });

  writeFileSync(CLAUDE_SETTINGS, JSON.stringify(settings, null, 2));
  logOk("Hooks merged into ~/.claude/settings.json");
}

function runInit() {
  console.log("\n  Claude Pulse — Setup\n");
  checkDeps();
  setupDir();
  copyHook();
  writeConfig();
  initDb();
  mergeHooks();
  console.log("\n  Done! Claude Pulse is active for all projects.");
  console.log("  Run: npx claude-pulse       (open dashboard)");
  console.log("  Run: npx claude-pulse status (terminal summary)\n");
}

// ─── START ───

function runStart() {
  const port = 3141;
  const projectRoot = join(__dirname, "..");
  const nextDir = join(projectRoot, ".next");

  // Auto-build if no .next directory exists
  if (!existsSync(nextDir)) {
    console.log("\n  First run — building dashboard...\n");
    try {
      execSync(`cd "${projectRoot}" && npm run build`, { stdio: "inherit" });
    } catch {
      console.log("\n  Build failed, starting in dev mode instead.\n");
      execSync(`cd "${projectRoot}" && npx next dev --port ${port}`, { stdio: "inherit" });
      return;
    }
  }

  console.log(`\n  Claude Pulse dashboard starting on http://localhost:${port}\n`);
  try {
    execSync(`cd "${projectRoot}" && npx next start --port ${port}`, { stdio: "inherit" });
  } catch {
    // Fallback to dev mode
    execSync(`cd "${projectRoot}" && npx next dev --port ${port}`, { stdio: "inherit" });
  }
}

// ─── STATUS ───

function runStatus() {
  if (!existsSync(DB_PATH)) {
    log("No data yet. Run: claude-pulse init");
    return;
  }

  try {
    const sessions = execSync(`sqlite3 "${DB_PATH}" "SELECT COUNT(*) FROM sessions;"`, { encoding: "utf-8" }).trim();
    const events = execSync(`sqlite3 "${DB_PATH}" "SELECT COUNT(*) FROM tool_events;"`, { encoding: "utf-8" }).trim();
    const projects = execSync(`sqlite3 "${DB_PATH}" "SELECT COUNT(DISTINCT project) FROM sessions;"`, { encoding: "utf-8" }).trim();
    const todaySessions = execSync(`sqlite3 "${DB_PATH}" "SELECT COUNT(*) FROM sessions WHERE date(started_at) = date('now');"`, { encoding: "utf-8" }).trim();
    const todayLines = execSync(`sqlite3 "${DB_PATH}" "SELECT COALESCE(SUM(lines_added) - SUM(lines_removed), 0) FROM daily_summaries WHERE date = date('now');"`, { encoding: "utf-8" }).trim();
    const size = statSync(DB_PATH).size;

    console.log("\n  Claude Pulse — Status\n");
    log(`Sessions:  ${sessions} total, ${todaySessions} today`);
    log(`Events:    ${events} tool calls tracked`);
    log(`Projects:  ${projects}`);
    log(`Today:     ${todayLines} net lines`);
    log(`Database:  ${(size / 1024 / 1024).toFixed(1)} MB`);
    log(`Dashboard: http://localhost:3141`);
    console.log();
  } catch (e) {
    logWarn(`Error reading database: ${e.message}`);
  }
}

// ─── UNINSTALL ───

function runUninstall() {
  console.log("\n  Claude Pulse — Uninstall\n");

  if (existsSync(CLAUDE_SETTINGS)) {
    try {
      const settings = JSON.parse(readFileSync(CLAUDE_SETTINGS, "utf-8"));
      let changed = false;

      for (const event of Object.keys(settings.hooks || {})) {
        const before = settings.hooks[event].length;
        settings.hooks[event] = settings.hooks[event].filter(
          (entry) => !JSON.stringify(entry).includes("claude-pulse")
        );
        if (settings.hooks[event].length < before) changed = true;
        if (settings.hooks[event].length === 0) delete settings.hooks[event];
      }

      if (changed) {
        writeFileSync(CLAUDE_SETTINGS, JSON.stringify(settings, null, 2));
        logOk("Removed hooks from settings.json");
      } else {
        log("No Claude Pulse hooks found in settings.json");
      }
    } catch (e) {
      logWarn(`Could not update settings.json: ${e.message}`);
    }
  }

  log(`Data directory preserved at: ${PULSE_DIR}`);
  log("To delete all data: rm -rf ~/.claude-pulse");
  console.log();
}

// ─── DOCTOR ───

function runDoctor() {
  console.log("\n  Claude Pulse — Health Check\n");
  let issues = 0;

  // 1. Check dependencies
  for (const dep of ["jq", "sqlite3"]) {
    try {
      execSync(`which ${dep}`, { stdio: "pipe" });
      logOk(`${dep} found`);
    } catch {
      logWarn(`${dep} not found — install with: brew install ${dep} (macOS) or apt install ${dep} (Linux)`);
      issues++;
    }
  }

  // 2. Check data directory
  if (existsSync(PULSE_DIR)) {
    logOk(`Data directory: ${PULSE_DIR}`);
  } else {
    logWarn("Data directory missing — run: claude-pulse init");
    issues++;
  }

  // 3. Check hook script
  if (existsSync(HOOK_PATH)) {
    logOk(`Hook script: ${HOOK_PATH}`);
    // Check if executable
    try {
      execSync(`test -x "${HOOK_PATH}"`, { stdio: "pipe" });
      logOk("Hook is executable");
    } catch {
      logWarn("Hook is not executable — run: chmod +x ~/.claude-pulse/hook.sh");
      issues++;
    }
  } else {
    logWarn("Hook script missing — run: claude-pulse init");
    issues++;
  }

  // 4. Check database
  if (existsSync(DB_PATH)) {
    try {
      const tables = execSync(`sqlite3 "${DB_PATH}" ".tables"`, { encoding: "utf-8" }).trim();
      const hasInsights = tables.includes("insights");
      logOk(`Database: ${(statSync(DB_PATH).size / 1024 / 1024).toFixed(1)} MB`);
      logOk(`Tables: ${tables.replace(/\s+/g, ", ")}`);
      if (!hasInsights) {
        logWarn("Missing 'insights' table — run: claude-pulse init (will migrate)");
        issues++;
      }
    } catch (e) {
      logWarn(`Database error: ${e.message}`);
      issues++;
    }
  } else {
    logWarn("Database missing — run: claude-pulse init");
    issues++;
  }

  // 5. Check hooks in settings.json
  if (existsSync(CLAUDE_SETTINGS)) {
    try {
      const settings = JSON.parse(readFileSync(CLAUDE_SETTINGS, "utf-8"));
      const hooksJson = JSON.stringify(settings.hooks || {});
      if (hooksJson.includes("claude-pulse")) {
        logOk("Hooks registered in ~/.claude/settings.json");

        // Check for outdated cat | prefix
        if (hooksJson.includes("cat |")) {
          logWarn("Hooks use outdated 'cat |' prefix — run: claude-pulse init (will update)");
          issues++;
        }

        // Check for async on PostToolUse
        const postToolHooks = settings.hooks?.PostToolUse || [];
        const pulsePostTool = postToolHooks.find(h => JSON.stringify(h).includes("claude-pulse"));
        if (pulsePostTool) {
          const hookDef = pulsePostTool.hooks?.[0];
          if (!hookDef?.async) {
            logWarn("PostToolUse hook is synchronous — consider re-running: claude-pulse init");
            issues++;
          } else {
            logOk("PostToolUse hook is async (non-blocking)");
          }
        }
      } else {
        logWarn("Hooks not found in settings.json — run: claude-pulse init");
        issues++;
      }
    } catch (e) {
      logWarn(`Could not read settings.json: ${e.message}`);
      issues++;
    }
  } else {
    logWarn("~/.claude/settings.json not found — is Claude Code installed?");
    issues++;
  }

  // 6. Check recent data
  if (existsSync(DB_PATH)) {
    try {
      const lastEvent = execSync(
        `sqlite3 "${DB_PATH}" "SELECT timestamp FROM tool_events ORDER BY timestamp DESC LIMIT 1;"`,
        { encoding: "utf-8" }
      ).trim();
      if (lastEvent) {
        const ago = Math.floor((Date.now() - new Date(lastEvent).getTime()) / 60000);
        if (ago < 60) {
          logOk(`Last event: ${ago} minutes ago`);
        } else if (ago < 1440) {
          logOk(`Last event: ${Math.floor(ago / 60)} hours ago`);
        } else {
          logWarn(`Last event: ${Math.floor(ago / 1440)} days ago — hook may not be firing`);
          issues++;
        }
      } else {
        logWarn("No events recorded yet — use Claude Code to generate some");
      }
    } catch { /* ignore */ }
  }

  // Summary
  console.log();
  if (issues === 0) {
    log("All checks passed. Claude Pulse is healthy.\n");
  } else {
    log(`${issues} issue(s) found. Fix them with the commands above.\n`);
  }
}

// ─── EXPORT ───

function runExport() {
  const args = process.argv.slice(3);
  let format = "json";
  let startDate = null;
  let endDate = null;
  let table = "all";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--format" && args[i + 1]) format = args[++i];
    if (args[i] === "--start" && args[i + 1]) startDate = args[++i];
    if (args[i] === "--end" && args[i + 1]) endDate = args[++i];
    if (args[i] === "--table" && args[i + 1]) table = args[++i];
  }

  if (!existsSync(DB_PATH)) {
    console.error("  [!!] No database found. Run: claude-pulse init");
    process.exit(1);
  }

  let dateFilter = "";
  if (startDate) dateFilter += ` AND timestamp >= '${startDate}'`;
  if (endDate) dateFilter += ` AND timestamp <= '${endDate}'`;

  let sessionDateFilter = "";
  if (startDate) sessionDateFilter += ` AND started_at >= '${startDate}'`;
  if (endDate) sessionDateFilter += ` AND started_at <= '${endDate}'`;

  const exportData = {};

  if (table === "all" || table === "sessions") {
    const rows = execSync(
      `sqlite3 -json "${DB_PATH}" "SELECT * FROM sessions WHERE 1=1${sessionDateFilter} ORDER BY started_at DESC;"`,
      { encoding: "utf-8" }
    ).trim();
    exportData.sessions = rows ? JSON.parse(rows) : [];
  }

  if (table === "all" || table === "events") {
    const rows = execSync(
      `sqlite3 -json "${DB_PATH}" "SELECT * FROM tool_events WHERE 1=1${dateFilter} ORDER BY timestamp DESC;"`,
      { encoding: "utf-8" }
    ).trim();
    exportData.events = rows ? JSON.parse(rows) : [];
  }

  if (table === "all" || table === "insights") {
    const rows = execSync(
      `sqlite3 -json "${DB_PATH}" "SELECT * FROM insights WHERE 1=1${dateFilter.replace(/timestamp/g, 'created_at')} ORDER BY created_at DESC;"`,
      { encoding: "utf-8" }
    ).trim();
    exportData.insights = rows ? JSON.parse(rows) : [];
  }

  if (format === "json") {
    exportData.exported_at = new Date().toISOString();
    exportData.hostname = execSync("hostname -s", { encoding: "utf-8" }).trim();
    exportData.user = execSync("whoami", { encoding: "utf-8" }).trim();
    console.log(JSON.stringify(exportData, null, 2));
  } else if (format === "csv") {
    // CSV output for the primary table
    const targetTable = table === "all" ? "events" : table;
    const rows = exportData[targetTable] || exportData[Object.keys(exportData)[0]] || [];
    if (rows.length === 0) {
      console.error("  No data to export.");
      return;
    }
    const headers = Object.keys(rows[0]);
    console.log(headers.join(","));
    for (const row of rows) {
      console.log(headers.map(h => {
        const val = String(row[h] ?? "").replace(/"/g, '""');
        return val.includes(",") || val.includes('"') || val.includes("\n") ? `"${val}"` : val;
      }).join(","));
    }
  } else if (format === "ndjson") {
    // Newline-delimited JSON — ideal for audit log ingestion
    const allRows = [
      ...(exportData.sessions || []).map(r => ({ ...r, _table: "session" })),
      ...(exportData.events || []).map(r => ({ ...r, _table: "event" })),
      ...(exportData.insights || []).map(r => ({ ...r, _table: "insight" })),
    ];
    allRows.sort((a, b) => (a.timestamp || a.started_at || a.created_at || "").localeCompare(b.timestamp || b.started_at || b.created_at || ""));
    for (const row of allRows) {
      console.log(JSON.stringify(row));
    }
  }
}

// ─── VERIFY ───

function runVerify() {
  console.log("\n  Claude Pulse — Integrity Verification\n");

  if (!existsSync(DB_PATH)) {
    console.error("  [!!] No database found.");
    process.exit(1);
  }

  // Check database integrity
  try {
    const integrity = execSync(`sqlite3 "${DB_PATH}" "PRAGMA integrity_check;"`, { encoding: "utf-8" }).trim();
    if (integrity === "ok") {
      logOk("Database integrity: OK");
    } else {
      logWarn(`Database integrity: ${integrity}`);
    }
  } catch (e) {
    logWarn(`Database integrity check failed: ${e.message}`);
  }

  // Count records by table
  const tables = ["sessions", "tool_events", "insights", "daily_summaries", "file_activity"];
  for (const t of tables) {
    try {
      const count = execSync(`sqlite3 "${DB_PATH}" "SELECT COUNT(*) FROM ${t};"`, { encoding: "utf-8" }).trim();
      logOk(`${t}: ${count} records`);
    } catch { /* ignore */ }
  }

  // Check for sessions with user/hostname
  try {
    const withUser = execSync(
      `sqlite3 "${DB_PATH}" "SELECT COUNT(*) FROM sessions WHERE user IS NOT NULL AND user != '';"`,
      { encoding: "utf-8" }
    ).trim();
    const total = execSync(
      `sqlite3 "${DB_PATH}" "SELECT COUNT(*) FROM sessions;"`,
      { encoding: "utf-8" }
    ).trim();
    logOk(`Sessions with user identity: ${withUser}/${total}`);
  } catch { /* ignore */ }

  // Check for events with diff content
  try {
    const withDiff = execSync(
      `sqlite3 "${DB_PATH}" "SELECT COUNT(*) FROM tool_events WHERE diff_content IS NOT NULL AND diff_content != '';"`,
      { encoding: "utf-8" }
    ).trim();
    const totalEdits = execSync(
      `sqlite3 "${DB_PATH}" "SELECT COUNT(*) FROM tool_events WHERE tool_name IN ('Edit','Write');"`,
      { encoding: "utf-8" }
    ).trim();
    logOk(`Edit events with diff captured: ${withDiff}/${totalEdits}`);
  } catch { /* ignore */ }

  // Check date range coverage
  try {
    const range = execSync(
      `sqlite3 "${DB_PATH}" "SELECT MIN(started_at), MAX(started_at) FROM sessions;"`,
      { encoding: "utf-8" }
    ).trim();
    const [first, last] = range.split("|");
    if (first && last) {
      logOk(`Date range: ${first.split("T")[0]} → ${last.split("T")[0]}`);
    }
  } catch { /* ignore */ }

  // Database file size
  const sizeBytes = statSync(DB_PATH).size;
  const sizeMB = (sizeBytes / 1024 / 1024).toFixed(2);
  logOk(`Database size: ${sizeMB} MB`);

  console.log();
}

// ─── ROUTE ───

switch (command) {
  case "init":
    runInit();
    break;
  case "start":
    runStart();
    break;
  case "status":
    runStatus();
    break;
  case "uninstall":
    runUninstall();
    break;
  case "doctor":
    runDoctor();
    break;
  case "export":
    runExport();
    break;
  case "verify":
    runVerify();
    break;
  case "help":
  case "--help":
  case "-h":
    console.log(`
  Claude Pulse — Activity tracker for Claude Code

  Commands:
    init        Set up hooks and database
    start       Open the dashboard (default)
    status      Quick terminal summary
    doctor      Health check — verify everything works
    export      Export data (--format json|csv|ndjson --start YYYY-MM-DD --end YYYY-MM-DD)
    verify      Audit integrity check — record counts, user coverage, diff capture
    uninstall   Remove hooks from settings.json
    help        Show this message
`);
    break;
  default:
    console.log(`Unknown command: ${command}. Run: claude-pulse help`);
    process.exit(1);
}
