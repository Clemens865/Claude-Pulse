import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

interface InsightRow {
  id: number;
  session_id: string | null;
  project: string;
  type: string;
  content: string;
  reasoning: string | null;
  created_at: string;
}

export async function GET(request: Request) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const project = searchParams.get("project");
    const type = searchParams.get("type");
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    let query = `SELECT id, session_id, project, type, content, reasoning, created_at FROM insights`;
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (project) {
      conditions.push("project = ?");
      params.push(project);
    }
    if (type) {
      conditions.push("type = ?");
      params.push(type);
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }
    query += " ORDER BY created_at DESC LIMIT ?";
    params.push(limit);

    const insights = db.prepare(query).all(...params) as InsightRow[];

    // Type counts for filtering
    const typeCounts = db
      .prepare(
        `SELECT type, COUNT(*) as count FROM insights${
          project ? " WHERE project = ?" : ""
        } GROUP BY type ORDER BY count DESC`
      )
      .all(...(project ? [project] : [])) as Array<{
      type: string;
      count: number;
    }>;

    // Project list for filtering
    const projects = db
      .prepare(
        `SELECT DISTINCT project FROM insights ORDER BY project`
      )
      .all() as Array<{ project: string }>;

    return Response.json({
      insights: insights.map((i) => ({
        id: i.id,
        sessionId: i.session_id,
        project: i.project,
        type: i.type,
        content: i.content,
        reasoning: i.reasoning,
        createdAt: i.created_at,
      })),
      typeCounts: Object.fromEntries(typeCounts.map((t) => [t.type, t.count])),
      projects: projects.map((p) => p.project),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
