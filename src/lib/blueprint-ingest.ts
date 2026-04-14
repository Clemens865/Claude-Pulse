import fs from "fs";
import path from "path";
import { getDb } from "./db";

interface LazyStepResult {
  name: string;
  type: string;
  status: string;
  output?: string;
  retries?: number;
}

interface LazyRunFile {
  blueprint: string;
  input?: string;
  started: string;
  status: "running" | "completed" | "failed";
  stepResults?: LazyStepResult[];
  worktree?: {
    path?: string;
    branch?: string;
    canonicalRepoPath?: string;
    baseBranch?: string;
  };
}

export interface IngestStats {
  scanned: number;
  added: number;
  updated: number;
  skipped: number;
  errors: number;
}

const RUNS_GLOB = ".lazy/runs";

function listKnownProjectPaths(): Array<{ project: string; project_path: string }> {
  const db = getDb();
  return db
    .prepare(
      `SELECT DISTINCT project, project_path
         FROM sessions
        WHERE project_path IS NOT NULL AND project_path != ''`
    )
    .all() as Array<{ project: string; project_path: string }>;
}

function readRunFile(file: string): LazyRunFile | null {
  try {
    const raw = fs.readFileSync(file, "utf-8");
    return JSON.parse(raw) as LazyRunFile;
  } catch {
    return null;
  }
}

function deriveCompletedAt(status: string, mtimeMs: number, started: string): string | null {
  if (status === "running") return null;
  // Use file mtime as the best available proxy for completion time.
  return new Date(mtimeMs).toISOString();
}

function findSessionForRun(
  projectPath: string,
  startedAt: string
): string | null {
  const db = getDb();
  // Pick the session whose window contains the run start time.
  // For active sessions (ended_at IS NULL) we accept any started_at <= run start.
  // Order by started_at DESC so we get the most recent enclosing session.
  const row = db
    .prepare(
      `SELECT id FROM sessions
        WHERE project_path = ?
          AND started_at <= ?
          AND (ended_at IS NULL OR ended_at >= ?)
        ORDER BY started_at DESC
        LIMIT 1`
    )
    .get(projectPath, startedAt, startedAt) as { id: string } | undefined;
  return row?.id ?? null;
}

function upsertRun(
  file: string,
  mtimeMs: number,
  project: string,
  projectPath: string,
  data: LazyRunFile
): "added" | "updated" | "skipped" {
  const db = getDb();
  const id = path.basename(file, ".json");

  const existing = db
    .prepare("SELECT source_mtime FROM blueprint_runs WHERE id = ?")
    .get(id) as { source_mtime: number } | undefined;

  if (existing && existing.source_mtime >= Math.floor(mtimeMs)) {
    return "skipped";
  }

  const steps = data.stepResults ?? [];
  const stepsDone = steps.filter((s) => s.status === "done").length;
  const stepsFailed = steps.filter((s) => s.status === "failed").length;
  const completedAt = deriveCompletedAt(data.status, mtimeMs, data.started);
  const durationMs =
    completedAt !== null ? Date.parse(completedAt) - Date.parse(data.started) : null;

  // canonicalRepoPath wins over the iterating project_path because worktrees may
  // live in ~/.lazy/worktrees/* — the canonical path is the source-of-truth project.
  const canonicalPath = data.worktree?.canonicalRepoPath || projectPath;
  const canonicalProject = path.basename(canonicalPath) || project;
  const sessionId = findSessionForRun(canonicalPath, data.started);

  db.prepare(
    `INSERT INTO blueprint_runs (
       id, project, project_path, blueprint, input, status, started_at,
       completed_at, duration_ms, step_count, steps_done, steps_failed,
       worktree_path, worktree_branch, base_branch, step_results, session_id,
       source_file, source_mtime
     ) VALUES (
       @id, @project, @project_path, @blueprint, @input, @status, @started_at,
       @completed_at, @duration_ms, @step_count, @steps_done, @steps_failed,
       @worktree_path, @worktree_branch, @base_branch, @step_results, @session_id,
       @source_file, @source_mtime
     )
     ON CONFLICT(id) DO UPDATE SET
       status        = excluded.status,
       completed_at  = excluded.completed_at,
       duration_ms   = excluded.duration_ms,
       step_count    = excluded.step_count,
       steps_done    = excluded.steps_done,
       steps_failed  = excluded.steps_failed,
       step_results  = excluded.step_results,
       session_id    = COALESCE(excluded.session_id, blueprint_runs.session_id),
       source_mtime  = excluded.source_mtime,
       ingested_at   = datetime('now')`
  ).run({
    id,
    project: canonicalProject,
    project_path: canonicalPath,
    blueprint: data.blueprint,
    input: data.input ?? null,
    status: data.status,
    started_at: data.started,
    completed_at: completedAt,
    duration_ms: durationMs,
    step_count: steps.length,
    steps_done: stepsDone,
    steps_failed: stepsFailed,
    worktree_path: data.worktree?.path ?? null,
    worktree_branch: data.worktree?.branch ?? null,
    base_branch: data.worktree?.baseBranch ?? null,
    step_results: JSON.stringify(steps),
    session_id: sessionId,
    source_file: file,
    source_mtime: Math.floor(mtimeMs),
  });

  return existing ? "updated" : "added";
}

/**
 * Walk every project path Pulse has seen, scan its .lazy/runs/ dir for
 * Lazy-Fetch run JSON files, and upsert into blueprint_runs. Cheap on
 * subsequent calls because mtime gates re-ingestion.
 */
export function ingestBlueprintRuns(): IngestStats {
  const stats: IngestStats = { scanned: 0, added: 0, updated: 0, skipped: 0, errors: 0 };
  const projects = listKnownProjectPaths();

  for (const { project, project_path } of projects) {
    const runsDir = path.join(project_path, RUNS_GLOB);
    if (!fs.existsSync(runsDir)) continue;

    let entries: string[];
    try {
      entries = fs.readdirSync(runsDir).filter((f) => f.endsWith(".json"));
    } catch {
      stats.errors += 1;
      continue;
    }

    for (const entry of entries) {
      const full = path.join(runsDir, entry);
      stats.scanned += 1;
      let stat: fs.Stats;
      try {
        stat = fs.statSync(full);
      } catch {
        stats.errors += 1;
        continue;
      }
      const data = readRunFile(full);
      if (!data || !data.blueprint || !data.started || !data.status) {
        stats.errors += 1;
        continue;
      }
      try {
        const result = upsertRun(full, stat.mtimeMs, project, project_path, data);
        stats[result] += 1;
      } catch {
        stats.errors += 1;
      }
    }
  }

  return stats;
}
