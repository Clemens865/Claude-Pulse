import { getDb } from "@/lib/db";
import { ingestBlueprintRuns } from "@/lib/blueprint-ingest";

export const dynamic = "force-dynamic";

interface RunRow {
  id: string;
  project: string;
  project_path: string;
  blueprint: string;
  input: string | null;
  status: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  step_count: number;
  steps_done: number;
  steps_failed: number;
  worktree_path: string | null;
  worktree_branch: string | null;
  base_branch: string | null;
  step_results: string;
  session_id: string | null;
}

export async function GET(request: Request) {
  try {
    // Lazy-on-read ingestion. mtime gating keeps it cheap when nothing changed.
    const ingestStats = ingestBlueprintRuns();

    const db = getDb();
    const { searchParams } = new URL(request.url);
    const project = searchParams.get("project");
    const status = searchParams.get("status");
    const blueprint = searchParams.get("blueprint");
    const limit = parseInt(searchParams.get("limit") || "100", 10);

    let query = `SELECT id, project, project_path, blueprint, input, status,
                        started_at, completed_at, duration_ms, step_count,
                        steps_done, steps_failed, worktree_path, worktree_branch,
                        base_branch, step_results, session_id
                   FROM blueprint_runs`;
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (project) {
      conditions.push("project = ?");
      params.push(project);
    }
    if (status) {
      conditions.push("status = ?");
      params.push(status);
    }
    if (blueprint) {
      conditions.push("blueprint = ?");
      params.push(blueprint);
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }
    query += " ORDER BY started_at DESC LIMIT ?";
    params.push(limit);

    const rows = db.prepare(query).all(...params) as RunRow[];

    const projects = db
      .prepare("SELECT DISTINCT project FROM blueprint_runs ORDER BY project")
      .all() as Array<{ project: string }>;

    const statusCounts = db
      .prepare(
        `SELECT status, COUNT(*) as count FROM blueprint_runs${
          project ? " WHERE project = ?" : ""
        } GROUP BY status`
      )
      .all(...(project ? [project] : [])) as Array<{ status: string; count: number }>;

    return Response.json({
      runs: rows.map((r) => ({
        id: r.id,
        project: r.project,
        projectPath: r.project_path,
        blueprint: r.blueprint,
        input: r.input,
        status: r.status,
        startedAt: r.started_at,
        completedAt: r.completed_at,
        durationMs: r.duration_ms,
        stepCount: r.step_count,
        stepsDone: r.steps_done,
        stepsFailed: r.steps_failed,
        worktreePath: r.worktree_path,
        worktreeBranch: r.worktree_branch,
        baseBranch: r.base_branch,
        steps: JSON.parse(r.step_results),
        sessionId: r.session_id,
      })),
      projects: projects.map((p) => p.project),
      statusCounts: Object.fromEntries(statusCounts.map((s) => [s.status, s.count])),
      ingest: ingestStats,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
