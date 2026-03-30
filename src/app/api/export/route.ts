import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") || "json";
    const table = searchParams.get("table") || "all";
    const start = searchParams.get("start");
    const end = searchParams.get("end");
    const project = searchParams.get("project");

    const data: Record<string, unknown[]> = {};

    if (table === "all" || table === "sessions") {
      let q = "SELECT * FROM sessions WHERE 1=1";
      const params: string[] = [];
      if (project) { q += " AND project = ?"; params.push(project); }
      if (start) { q += " AND started_at >= ?"; params.push(start); }
      if (end) { q += " AND started_at <= ?"; params.push(end); }
      q += " ORDER BY started_at DESC";
      data.sessions = db.prepare(q).all(...params);
    }

    if (table === "all" || table === "events") {
      let q = "SELECT e.* FROM tool_events e";
      if (project) q += " JOIN sessions s ON s.id = e.session_id";
      q += " WHERE 1=1";
      const params: string[] = [];
      if (project) { q += " AND s.project = ?"; params.push(project); }
      if (start) { q += " AND e.timestamp >= ?"; params.push(start); }
      if (end) { q += " AND e.timestamp <= ?"; params.push(end); }
      q += " ORDER BY e.timestamp DESC";
      data.events = db.prepare(q).all(...params);
    }

    if (table === "all" || table === "insights") {
      let q = "SELECT * FROM insights WHERE 1=1";
      const params: string[] = [];
      if (project) { q += " AND project = ?"; params.push(project); }
      if (start) { q += " AND created_at >= ?"; params.push(start); }
      if (end) { q += " AND created_at <= ?"; params.push(end); }
      q += " ORDER BY created_at DESC";
      data.insights = db.prepare(q).all(...params);
    }

    if (format === "csv") {
      const targetKey = table === "all" ? "events" : table;
      const rows = (data[targetKey] || []) as Record<string, unknown>[];
      if (rows.length === 0) {
        return new Response("No data", { status: 404 });
      }
      const headers = Object.keys(rows[0]);
      const csvLines = [headers.join(",")];
      for (const row of rows) {
        csvLines.push(
          headers.map((h) => {
            const val = String(row[h] ?? "").replace(/"/g, '""');
            return val.includes(",") || val.includes('"') || val.includes("\n")
              ? `"${val}"`
              : val;
          }).join(",")
        );
      }
      return new Response(csvLines.join("\n"), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="claude-pulse-${table}-${new Date().toISOString().split("T")[0]}.csv"`,
        },
      });
    }

    // JSON (default)
    const exportPayload = {
      exported_at: new Date().toISOString(),
      ...data,
    };

    return new Response(JSON.stringify(exportPayload, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="claude-pulse-export-${new Date().toISOString().split("T")[0]}.json"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
