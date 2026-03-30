"use client";

import { useEffect, useState } from "react";

interface SettingsData {
  dbPath: string;
  dbSize: number;
  hookExists: boolean;
  hookPath: string;
  counts: {
    sessions: number;
    events: number;
    summaries: number;
    fileActivity: number;
  };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export default function SettingsPage() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportStart, setExportStart] = useState("");
  const [exportEnd, setExportEnd] = useState("");
  const [exportProject, setExportProject] = useState("");
  const [projects, setProjects] = useState<string[]>([]);

  const loadSettings = () => {
    fetch("/api/settings")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message));
  };

  useEffect(() => {
    loadSettings();
    fetch("/api/insights")
      .then((r) => r.json())
      .then((d) => setProjects(d.projects || []))
      .catch(() => {});
  }, []);

  const handleSeed = async () => {
    setSeeding(true);
    setMessage(null);
    try {
      const r = await fetch("/api/seed", { method: "POST" });
      const d = await r.json();
      if (d.ok) {
        setMessage(
          `Seeded ${d.inserted.sessions} sessions, ${d.inserted.toolEvents} events, ${d.inserted.dailySummaries} summaries, ${d.inserted.fileActivity} file records`
        );
        loadSettings();
      } else {
        setMessage(`Seed failed: ${d.error}`);
      }
    } catch (e) {
      setMessage(`Seed failed: ${e instanceof Error ? e.message : "Unknown"}`);
    } finally {
      setSeeding(false);
    }
  };

  const handleClear = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    setClearing(true);
    setMessage(null);
    setConfirmClear(false);
    try {
      const r = await fetch("/api/settings", { method: "DELETE" });
      const d = await r.json();
      if (d.ok) {
        setMessage("All data cleared successfully");
        loadSettings();
      } else {
        setMessage(`Clear failed: ${d.error}`);
      }
    } catch (e) {
      setMessage(
        `Clear failed: ${e instanceof Error ? e.message : "Unknown"}`
      );
    } finally {
      setClearing(false);
    }
  };

  if (error) {
    return (
      <div className="rounded-lg border border-red-900/50 bg-red-950/20 p-6">
        <p className="font-mono text-sm text-red-400">
          Failed to load: {error}
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <h1 className="font-mono text-lg font-semibold">Settings</h1>
        <div className="h-48 animate-pulse rounded-lg border border-zinc-800 bg-zinc-900/50" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="font-mono text-lg font-semibold">Settings</h1>

      {/* Database Info */}
      <div className="rounded-lg border border-zinc-800 p-5">
        <h2 className="mb-4 font-mono text-xs uppercase tracking-wider text-zinc-500">
          Database
        </h2>
        <div className="space-y-3 font-mono text-sm">
          <div className="flex items-center justify-between">
            <span className="text-zinc-500">Path</span>
            <span className="text-zinc-300">{data.dbPath}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-zinc-500">Size</span>
            <span className="text-zinc-300">{formatBytes(data.dbSize)}</span>
          </div>
        </div>
      </div>

      {/* Hook Status */}
      <div className="rounded-lg border border-zinc-800 p-5">
        <h2 className="mb-4 font-mono text-xs uppercase tracking-wider text-zinc-500">
          Hook Status
        </h2>
        <div className="space-y-3 font-mono text-sm">
          <div className="flex items-center justify-between">
            <span className="text-zinc-500">Hook File</span>
            <span className="text-zinc-300">{data.hookPath}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-zinc-500">Status</span>
            {data.hookExists ? (
              <span className="text-green-400">Installed</span>
            ) : (
              <span className="text-yellow-400">Not found</span>
            )}
          </div>
        </div>
      </div>

      {/* Record Counts */}
      <div className="rounded-lg border border-zinc-800 p-5">
        <h2 className="mb-4 font-mono text-xs uppercase tracking-wider text-zinc-500">
          Record Counts
        </h2>
        <div className="grid grid-cols-4 gap-4">
          <div>
            <p className="font-mono text-xs text-zinc-500">Sessions</p>
            <p className="mt-1 font-mono text-xl font-semibold text-zinc-50">
              {data.counts.sessions.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="font-mono text-xs text-zinc-500">Tool Events</p>
            <p className="mt-1 font-mono text-xl font-semibold text-zinc-50">
              {data.counts.events.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="font-mono text-xs text-zinc-500">Daily Summaries</p>
            <p className="mt-1 font-mono text-xl font-semibold text-zinc-50">
              {data.counts.summaries.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="font-mono text-xs text-zinc-500">File Activity</p>
            <p className="mt-1 font-mono text-xl font-semibold text-zinc-50">
              {data.counts.fileActivity.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="rounded-lg border border-zinc-800 p-5">
        <h2 className="mb-4 font-mono text-xs uppercase tracking-wider text-zinc-500">
          Actions
        </h2>
        <div className="flex items-center gap-4">
          <button
            onClick={handleSeed}
            disabled={seeding}
            className="rounded-md border border-violet-500/30 bg-violet-500/10 px-4 py-2 font-mono text-sm text-violet-400 transition-colors hover:bg-violet-500/20 disabled:opacity-50"
          >
            {seeding ? "Seeding..." : "Seed Demo Data"}
          </button>
          <button
            onClick={handleClear}
            disabled={clearing}
            className={`rounded-md border px-4 py-2 font-mono text-sm transition-colors disabled:opacity-50 ${
              confirmClear
                ? "border-red-500/50 bg-red-500/20 text-red-400 hover:bg-red-500/30"
                : "border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:bg-zinc-800"
            }`}
          >
            {clearing
              ? "Clearing..."
              : confirmClear
                ? "Click Again to Confirm"
                : "Clear All Data"}
          </button>
          {confirmClear && (
            <button
              onClick={() => setConfirmClear(false)}
              className="font-mono text-xs text-zinc-500 hover:text-zinc-300"
            >
              Cancel
            </button>
          )}
        </div>
        {message && (
          <p className="mt-3 font-mono text-xs text-zinc-400">{message}</p>
        )}
      </div>

      {/* Export */}
      <div className="rounded-lg border border-zinc-800 p-5">
        <h2 className="mb-4 font-mono text-xs uppercase tracking-wider text-zinc-500">
          Export
        </h2>
        <div className="mb-4 flex items-end gap-3">
          <div>
            <label className="block font-mono text-xs text-zinc-500 mb-1">Project</label>
            <select
              value={exportProject}
              onChange={(e) => setExportProject(e.target.value)}
              className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 font-mono text-sm text-zinc-300 focus:border-violet-500 focus:outline-none"
            >
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-mono text-xs text-zinc-500 mb-1">From</label>
            <input
              type="date"
              value={exportStart}
              onChange={(e) => setExportStart(e.target.value)}
              className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 font-mono text-sm text-zinc-300 focus:border-violet-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block font-mono text-xs text-zinc-500 mb-1">To</label>
            <input
              type="date"
              value={exportEnd}
              onChange={(e) => setExportEnd(e.target.value)}
              className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 font-mono text-sm text-zinc-300 focus:border-violet-500 focus:outline-none"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          {[
            { label: "All Data (JSON)", table: "all", format: "json" },
            { label: "Sessions (CSV)", table: "sessions", format: "csv" },
            { label: "Events (CSV)", table: "events", format: "csv" },
            { label: "Insights (CSV)", table: "insights", format: "csv" },
            { label: "Insights (JSON)", table: "insights", format: "json" },
          ].map((opt) => (
            <button
              key={`${opt.table}-${opt.format}`}
              disabled={exporting}
              onClick={async () => {
                setExporting(true);
                try {
                  const params = new URLSearchParams({ format: opt.format, table: opt.table });
                  if (exportProject) params.set("project", exportProject);
                  if (exportStart) params.set("start", exportStart);
                  if (exportEnd) params.set("end", exportEnd);
                  const r = await fetch(`/api/export?${params}`);
                  if (!r.ok) throw new Error(`HTTP ${r.status}`);
                  const blob = await r.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  const ext = opt.format === "csv" ? "csv" : "json";
                  a.href = url;
                  const projSlug = exportProject ? `-${exportProject}` : "";
                  a.download = `claude-pulse-${opt.table}${projSlug}-${new Date().toISOString().split("T")[0]}.${ext}`;
                  a.click();
                  URL.revokeObjectURL(url);
                  setMessage(`Exported ${opt.table} as ${opt.format.toUpperCase()}`);
                } catch (e) {
                  setMessage(`Export failed: ${e instanceof Error ? e.message : "Unknown"}`);
                } finally {
                  setExporting(false);
                }
              }}
              className="rounded-md border border-zinc-700 bg-zinc-800/50 px-4 py-2 font-mono text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-50"
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="mt-3 font-mono text-xs text-zinc-600">
          Leave dates empty to export all data. Also available via CLI: claude-pulse export --format json
        </p>
      </div>

      {/* Docs Link */}
      <div className="rounded-lg border border-zinc-800 p-5">
        <h2 className="mb-4 font-mono text-xs uppercase tracking-wider text-zinc-500">
          Documentation
        </h2>
        <p className="font-mono text-sm text-zinc-400">
          Claude Pulse is a local-first activity tracker for Claude Code.
          Data is stored in a SQLite database at{" "}
          <code className="text-violet-400">~/.claude-pulse/tracker.db</code>.
        </p>
        <p className="mt-2 font-mono text-sm text-zinc-400">
          Install the hook to automatically track Claude Code sessions.
          See the project README for setup instructions.
        </p>
      </div>
    </div>
  );
}
