import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

interface SessionRow {
  id: string;
  project: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  summary: string | null;
  status: string;
}

interface EventRow {
  id: number;
  tool_name: string;
  timestamp: string;
  file_path: string | null;
  language: string | null;
  lines_added: number;
  lines_removed: number;
  command: string | null;
  detected_framework: string | null;
  command_failed: number;
  search_pattern: string | null;
  agent_type: string | null;
  agent_description: string | null;
  skill_name: string | null;
  skill_args: string | null;
  diff_content: string | null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();

    const session = db
      .prepare(
        `SELECT id, project, started_at, ended_at, duration_seconds, summary, status, user, hostname
        FROM sessions WHERE id = ?`
      )
      .get(id) as SessionRow | undefined;

    if (!session) {
      return Response.json({ error: "Session not found" }, { status: 404 });
    }

    const events = db
      .prepare(
        `SELECT
          id, tool_name, timestamp, file_path, language,
          lines_added, lines_removed, command, detected_framework,
          command_failed, search_pattern, agent_type, agent_description,
          skill_name, skill_args, diff_content
        FROM tool_events
        WHERE session_id = ?
        ORDER BY timestamp ASC`
      )
      .all(id) as EventRow[];

    // Compute summary KPIs
    const totalLines = events.reduce(
      (acc, e) => ({
        added: acc.added + e.lines_added,
        removed: acc.removed + e.lines_removed,
      }),
      { added: 0, removed: 0 }
    );

    const uniqueFiles = new Set(events.filter((e) => e.file_path).map((e) => e.file_path));
    const uniqueTools = new Set(events.map((e) => e.tool_name));

    return Response.json({
      session: {
        id: session.id,
        project: session.project,
        startedAt: session.started_at,
        endedAt: session.ended_at,
        duration: session.duration_seconds ?? 0,
        summary: session.summary,
        status: session.status,
        user: (session as SessionRow & { user?: string }).user || null,
        hostname: (session as SessionRow & { hostname?: string }).hostname || null,
      },
      summary: {
        totalEvents: events.length,
        linesAdded: totalLines.added,
        linesRemoved: totalLines.removed,
        netLines: totalLines.added - totalLines.removed,
        uniqueFiles: uniqueFiles.size,
        uniqueTools: uniqueTools.size,
      },
      events: events.map((e) => ({
        id: e.id,
        toolName: e.tool_name,
        timestamp: e.timestamp,
        filePath: e.file_path,
        language: e.language,
        linesAdded: e.lines_added,
        linesRemoved: e.lines_removed,
        command: e.command,
        detectedFramework: e.detected_framework,
        commandFailed: e.command_failed === 1,
        searchPattern: e.search_pattern,
        agentType: e.agent_type,
        agentDescription: e.agent_description,
        skillName: e.skill_name,
        skillArgs: e.skill_args,
        diffContent: e.diff_content,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
