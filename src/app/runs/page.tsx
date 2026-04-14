"use client";

import { useEffect, useState } from "react";

interface Step {
  name: string;
  type: string;
  status: string;
  output?: string;
  retries?: number;
}

interface BlueprintRun {
  id: string;
  project: string;
  projectPath: string;
  blueprint: string;
  input: string | null;
  status: "running" | "completed" | "failed";
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  stepCount: number;
  stepsDone: number;
  stepsFailed: number;
  worktreePath: string | null;
  worktreeBranch: string | null;
  baseBranch: string | null;
  steps: Step[];
}

interface RunsData {
  runs: BlueprintRun[];
  projects: string[];
  statusCounts: Record<string, number>;
  ingest: { scanned: number; added: number; updated: number; skipped: number; errors: number };
}

const STATUS_COLORS: Record<string, string> = {
  completed: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  failed: "bg-rose-500/20 text-rose-400 border-rose-500/30",
  running: "bg-sky-500/20 text-sky-400 border-sky-500/30",
};

const STEP_STATUS_COLORS: Record<string, string> = {
  done: "text-emerald-400",
  failed: "text-rose-400",
  skipped: "text-zinc-500",
  running: "text-sky-400",
};

const STATUS_ICONS: Record<string, string> = {
  completed: "✓",
  failed: "✗",
  running: "◐",
};

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const diffH = Math.floor(diffMs / 3600000);
  const diffD = Math.floor(diffMs / 86400000);
  if (diffH < 1) {
    const m = Math.floor(diffMs / 60000);
    return m < 1 ? "just now" : `${m}m ago`;
  }
  if (diffH < 24) return `${diffH}h ago`;
  if (diffD < 7) return `${diffD}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function RunsPage() {
  const [data, setData] = useState<RunsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filterProject, setFilterProject] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    const params = new URLSearchParams();
    if (filterProject) params.set("project", filterProject);
    if (filterStatus) params.set("status", filterStatus);
    params.set("limit", "200");
    fetch(`/api/blueprint-runs?${params}`)
      .then((r) => r.json())
      .then(setData)
      .catch((e) => setError(e.message));
  }, [filterProject, filterStatus]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (error) {
    return <div className="text-red-400 font-mono text-sm">Error: {error}</div>;
  }
  if (!data) {
    return <div className="text-zinc-500 font-mono text-sm">Loading runs...</div>;
  }

  const total = Object.values(data.statusCounts).reduce((a, b) => a + b, 0);

  // Group by date
  const grouped: Record<string, BlueprintRun[]> = {};
  for (const run of data.runs) {
    const date = run.startedAt.split("T")[0];
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(run);
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-mono text-xl font-semibold tracking-tight">Runs</h1>
        <p className="mt-1 font-mono text-sm text-zinc-500">
          Lazy-Fetch blueprint executions across all tracked projects
        </p>
      </div>

      {/* KPI row */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <button
          onClick={() => setFilterStatus(null)}
          className={`rounded-lg border px-3 py-2 text-left font-mono transition-colors ${
            !filterStatus
              ? "border-violet-500 bg-violet-500/10"
              : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700"
          }`}
        >
          <div className="text-lg font-semibold text-zinc-50">{total}</div>
          <div className="text-xs text-zinc-500">Total</div>
        </button>
        {(["completed", "failed", "running"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(filterStatus === s ? null : s)}
            className={`rounded-lg border px-3 py-2 text-left font-mono transition-colors ${
              filterStatus === s
                ? "border-violet-500 bg-violet-500/10"
                : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700"
            }`}
          >
            <div className="text-lg font-semibold text-zinc-50">
              {data.statusCounts[s] || 0}
            </div>
            <div className="text-xs text-zinc-500 capitalize">
              {STATUS_ICONS[s]} {s}
            </div>
          </button>
        ))}
      </div>

      {/* Project filter */}
      {data.projects.length > 1 && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-zinc-500">Project:</span>
          <button
            onClick={() => setFilterProject(null)}
            className={`rounded px-2 py-1 font-mono text-xs transition-colors ${
              !filterProject
                ? "bg-zinc-700 text-zinc-50"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            All
          </button>
          {data.projects.map((p) => (
            <button
              key={p}
              onClick={() => setFilterProject(filterProject === p ? null : p)}
              className={`rounded px-2 py-1 font-mono text-xs transition-colors ${
                filterProject === p
                  ? "bg-zinc-700 text-zinc-50"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Empty state */}
      {data.runs.length === 0 && (
        <div className="mt-16 text-center">
          <div className="text-4xl mb-4">▶</div>
          <p className="font-mono text-sm text-zinc-500">
            No blueprint runs yet.
          </p>
          <p className="mt-2 font-mono text-xs text-zinc-600">
            Runs appear here automatically once Lazy-Fetch executes a blueprint
            in any tracked project.
          </p>
        </div>
      )}

      {/* Timeline */}
      <div className="space-y-6">
        {Object.entries(grouped).map(([date, runs]) => (
          <div key={date}>
            <div className="mb-3 flex items-center gap-3">
              <div className="font-mono text-xs font-semibold text-zinc-400">
                {new Date(date + "T00:00:00").toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </div>
              <div className="h-px flex-1 bg-zinc-800" />
              <div className="font-mono text-xs text-zinc-600">
                {runs.length} runs
              </div>
            </div>

            <div className="space-y-2 pl-4 border-l border-zinc-800">
              {runs.map((run) => {
                const isOpen = expanded.has(run.id);
                return (
                  <div
                    key={run.id}
                    className="rounded-md border border-zinc-800/50 bg-zinc-900/30 transition-colors hover:border-zinc-700"
                  >
                    <button
                      onClick={() => toggle(run.id)}
                      className="flex w-full items-start gap-3 px-3 py-2 text-left"
                    >
                      <span
                        className={`mt-0.5 inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
                          STATUS_COLORS[run.status] || STATUS_COLORS.completed
                        }`}
                      >
                        {STATUS_ICONS[run.status]} {run.status}
                      </span>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="font-mono text-sm font-semibold text-zinc-200">
                            {run.blueprint}
                          </span>
                          {run.input && (
                            <span className="font-mono text-xs text-zinc-500 truncate">
                              {run.input}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[10px] text-zinc-500">
                          <span>{run.project}</span>
                          <span>·</span>
                          <span>
                            {run.stepsDone}/{run.stepCount} steps
                            {run.stepsFailed > 0 &&
                              ` · ${run.stepsFailed} failed`}
                          </span>
                          <span>·</span>
                          <span>{formatDuration(run.durationMs)}</span>
                          {run.worktreeBranch && (
                            <>
                              <span>·</span>
                              <span className="text-zinc-600">
                                ⎇ {run.worktreeBranch.replace(/^lazy\/bp-/, "")}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="font-mono text-[10px] text-zinc-600">
                          {formatRelative(run.startedAt)}
                        </span>
                        <span className="font-mono text-[10px] text-zinc-700">
                          {isOpen ? "▼" : "▶"}
                        </span>
                      </div>
                    </button>

                    {isOpen && (
                      <div className="border-t border-zinc-800/50 px-3 py-2">
                        <ol className="space-y-1">
                          {run.steps.map((step, i) => (
                            <li
                              key={i}
                              className="flex items-start gap-2 font-mono text-xs"
                            >
                              <span
                                className={
                                  STEP_STATUS_COLORS[step.status] ||
                                  "text-zinc-500"
                                }
                              >
                                {step.status === "done" && "✓"}
                                {step.status === "failed" && "✗"}
                                {step.status === "skipped" && "○"}
                                {step.status === "running" && "◐"}
                              </span>
                              <span className="text-zinc-500">
                                [{step.type}]
                              </span>
                              <span className="text-zinc-300">{step.name}</span>
                              {step.retries !== undefined && step.retries > 0 && (
                                <span className="text-zinc-600">
                                  ×{step.retries + 1}
                                </span>
                              )}
                              {step.output && (
                                <span className="text-rose-400/70 truncate">
                                  — {step.output}
                                </span>
                              )}
                            </li>
                          ))}
                        </ol>
                        {run.worktreePath && (
                          <div className="mt-2 font-mono text-[10px] text-zinc-600">
                            worktree: {run.worktreePath}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Ingest stats footer */}
      {data.ingest && (
        <div className="mt-8 font-mono text-[10px] text-zinc-700">
          last ingest: scanned {data.ingest.scanned}, added {data.ingest.added},
          updated {data.ingest.updated}, skipped {data.ingest.skipped}
          {data.ingest.errors > 0 && `, errors ${data.ingest.errors}`}
        </div>
      )}
    </div>
  );
}
