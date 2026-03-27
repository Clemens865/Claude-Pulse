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

  // Check if already installed
  const alreadyInstalled = JSON.stringify(settings.hooks).includes("claude-pulse");
  if (alreadyInstalled) {
    logOk("Hooks already configured in settings.json");
    return;
  }

  // Add SessionStart hook
  if (!settings.hooks.SessionStart) settings.hooks.SessionStart = [];
  settings.hooks.SessionStart.push({
    hooks: [{
      type: "command",
      command: `echo '{"hook_type":"SessionStart","session_id":"'$CLAUDE_SESSION_ID'","cwd":"'$(pwd)'"}' | ${pulseHookCommand}`,
      timeout: 5,
      statusMessage: "Claude Pulse: recording session..."
    }]
  });

  // Add PostToolUse hook
  if (!settings.hooks.PostToolUse) settings.hooks.PostToolUse = [];
  settings.hooks.PostToolUse.push({
    matcher: "Write|Edit|Bash|Agent|Skill|Read|Glob|Grep|WebFetch|WebSearch|ToolSearch",
    hooks: [{
      type: "command",
      command: `jq --arg ht PostToolUse --arg sid "$CLAUDE_SESSION_ID" --arg cwd "$(pwd)" '. + {hook_type: $ht, session_id: $sid, cwd: $cwd}' | ${pulseHookCommand}`,
      timeout: 3,
      statusMessage: "Claude Pulse: tracking..."
    }]
  });

  // Add Stop hook
  if (!settings.hooks.Stop) settings.hooks.Stop = [];
  settings.hooks.Stop.push({
    hooks: [{
      type: "command",
      command: `echo '{"hook_type":"Stop","session_id":"'$CLAUDE_SESSION_ID'","cwd":"'$(pwd)'"}' | ${pulseHookCommand}`,
      timeout: 5,
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
  console.log(`\n  Claude Pulse dashboard starting on http://localhost:${port}\n`);
  try {
    execSync(`cd "${join(__dirname, "..")}" && npx next start --port ${port}`, { stdio: "inherit" });
  } catch {
    // Try dev mode if build doesn't exist
    execSync(`cd "${join(__dirname, "..")}" && npx next dev --port ${port}`, { stdio: "inherit" });
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
  case "help":
  case "--help":
  case "-h":
    console.log(`
  Claude Pulse — Activity tracker for Claude Code

  Commands:
    init        Set up hooks and database
    start       Open the dashboard (default)
    status      Quick terminal summary
    uninstall   Remove hooks from settings.json
    help        Show this message
`);
    break;
  default:
    console.log(`Unknown command: ${command}. Run: claude-pulse help`);
    process.exit(1);
}
