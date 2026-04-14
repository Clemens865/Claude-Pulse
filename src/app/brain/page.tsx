"use client";

import { useEffect, useState } from "react";

interface Insight {
  id: number;
  sessionId: string | null;
  project: string;
  type: string;
  content: string;
  reasoning: string | null;
  createdAt: string;
}

interface BrainData {
  insights: Insight[];
  typeCounts: Record<string, number>;
  projects: string[];
}

interface BlueprintRun {
  id: string;
  project: string;
  blueprint: string;
  input: string | null;
  status: "running" | "completed" | "failed";
  startedAt: string;
  durationMs: number | null;
  stepCount: number;
  stepsDone: number;
  stepsFailed: number;
  sessionId: string | null;
}

type TimelineItem =
  | { kind: "insight"; date: string; insight: Insight }
  | { kind: "run"; date: string; run: BlueprintRun };

const TYPE_COLORS: Record<string, string> = {
  progress: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  decision: "bg-violet-500/20 text-violet-400 border-violet-500/30",
  blocked: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  pattern: "bg-sky-500/20 text-sky-400 border-sky-500/30",
  fix: "bg-rose-500/20 text-rose-400 border-rose-500/30",
  context: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
};

const TYPE_ICONS: Record<string, string> = {
  progress: "→",
  decision: "◆",
  blocked: "■",
  pattern: "◇",
  fix: "✦",
  context: "○",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH = Math.floor(diffMs / 3600000);
  const diffD = Math.floor(diffMs / 86400000);

  if (diffH < 1) return "just now";
  if (diffH < 24) return `${diffH}h ago`;
  if (diffD < 7) return `${diffD}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatFullDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function BrainPage() {
  const [data, setData] = useState<BrainData | null>(null);
  const [runs, setRuns] = useState<BlueprintRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string | null>(null);
  const [filterProject, setFilterProject] = useState<string | null>(null);
  const [showRuns, setShowRuns] = useState<boolean>(false);

  useEffect(() => {
    const params = new URLSearchParams();
    if (filterType) params.set("type", filterType);
    if (filterProject) params.set("project", filterProject);
    params.set("limit", "100");

    fetch(`/api/insights?${params}`)
      .then((r) => r.json())
      .then(setData)
      .catch((e) => setError(e.message));
  }, [filterType, filterProject]);

  useEffect(() => {
    if (!showRuns) {
      setRuns([]);
      return;
    }
    const params = new URLSearchParams();
    if (filterProject) params.set("project", filterProject);
    params.set("limit", "100");
    fetch(`/api/blueprint-runs?${params}`)
      .then((r) => r.json())
      .then((d) => setRuns(d.runs ?? []))
      .catch(() => setRuns([]));
  }, [showRuns, filterProject]);

  if (error) {
    return (
      <div className="text-red-400 font-mono text-sm">Error: {error}</div>
    );
  }

  if (!data) {
    return (
      <div className="text-zinc-500 font-mono text-sm">Loading brain...</div>
    );
  }

  const totalInsights = Object.values(data.typeCounts).reduce(
    (a, b) => a + b,
    0
  );

  // Build unified, date-grouped timeline of insights + (optionally) runs
  const items: TimelineItem[] = [
    ...data.insights.map<TimelineItem>((i) => ({
      kind: "insight",
      date: i.createdAt,
      insight: i,
    })),
    ...(showRuns
      ? runs.map<TimelineItem>((r) => ({
          kind: "run",
          date: r.startedAt,
          run: r,
        }))
      : []),
  ].sort((a, b) => (a.date < b.date ? 1 : -1));

  const grouped: Record<string, TimelineItem[]> = {};
  for (const item of items) {
    const day = item.date.split("T")[0];
    if (!grouped[day]) grouped[day] = [];
    grouped[day].push(item);
  }

  const formatRunDuration = (ms: number | null) => {
    if (ms === null) return "—";
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60_000)}m`;
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-mono text-xl font-semibold tracking-tight">
          Brain
        </h1>
        <p className="mt-1 font-mono text-sm text-zinc-500">
          Decisions, progress, and patterns across sessions
        </p>
      </div>

      {/* KPI row */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
        {[
          { label: "Total", count: totalInsights, type: null },
          ...Object.entries(TYPE_ICONS).map(([type, icon]) => ({
            label: `${icon} ${type}`,
            count: data.typeCounts[type] || 0,
            type,
          })),
        ].map((item) => (
          <button
            key={item.label}
            onClick={() =>
              setFilterType(filterType === item.type ? null : item.type)
            }
            className={`rounded-lg border px-3 py-2 text-left font-mono transition-colors ${
              filterType === item.type
                ? "border-violet-500 bg-violet-500/10"
                : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700"
            }`}
          >
            <div className="text-lg font-semibold text-zinc-50">
              {item.count}
            </div>
            <div className="text-xs text-zinc-500 capitalize">{item.label}</div>
          </button>
        ))}
      </div>

      {/* Show runs toggle */}
      <div className="mb-6 flex items-center gap-2">
        <button
          onClick={() => setShowRuns((v) => !v)}
          className={`rounded border px-2 py-1 font-mono text-xs transition-colors ${
            showRuns
              ? "border-violet-500 bg-violet-500/10 text-violet-300"
              : "border-zinc-800 bg-zinc-900/50 text-zinc-500 hover:border-zinc-700"
          }`}
        >
          {showRuns ? "▶ runs visible" : "▶ show blueprint runs"}
        </button>
        {showRuns && runs.length > 0 && (
          <span className="font-mono text-[10px] text-zinc-600">
            {runs.length} runs interleaved
          </span>
        )}
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
              onClick={() =>
                setFilterProject(filterProject === p ? null : p)
              }
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
      {data.insights.length === 0 && (
        <div className="mt-16 text-center">
          <div className="text-4xl mb-4">◉</div>
          <p className="font-mono text-sm text-zinc-500">
            No insights yet. They&apos;ll appear after sessions with meaningful
            changes.
          </p>
          <p className="mt-2 font-mono text-xs text-zinc-600">
            The hook captures PROGRESS, DECISION, and BLOCKED entries
            automatically at session end.
          </p>
        </div>
      )}

      {/* Timeline */}
      <div className="space-y-6">
        {Object.entries(grouped).map(([date, dayItems]) => (
          <div key={date}>
            {/* Date header */}
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
                {dayItems.length} entries
              </div>
            </div>

            {/* Entries */}
            <div className="space-y-2 pl-4 border-l border-zinc-800">
              {dayItems.map((item) =>
                item.kind === "insight" ? (
                  <div
                    key={`i-${item.insight.id}`}
                    className="group flex items-start gap-3 rounded-md px-3 py-2 transition-colors hover:bg-zinc-900/50"
                  >
                    <span
                      className={`mt-0.5 inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
                        TYPE_COLORS[item.insight.type] || TYPE_COLORS.context
                      }`}
                    >
                      {TYPE_ICONS[item.insight.type] || "○"} {item.insight.type}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-sm text-zinc-200 leading-relaxed">
                        {item.insight.content}
                      </p>
                      {item.insight.reasoning && (
                        <p className="mt-1 font-mono text-xs text-zinc-500 italic">
                          {item.insight.reasoning}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="font-mono text-[10px] text-zinc-600">
                        {formatDate(item.insight.createdAt)}
                      </span>
                      <span
                        className="font-mono text-[10px] text-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity"
                        title={formatFullDate(item.insight.createdAt)}
                      >
                        {item.insight.project}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div
                    key={`r-${item.run.id}`}
                    className="group flex items-start gap-3 rounded-md border border-zinc-800/30 bg-zinc-900/20 px-3 py-2 transition-colors hover:bg-zinc-900/50"
                  >
                    <span
                      className={`mt-0.5 inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
                        item.run.status === "completed"
                          ? "border-emerald-500/30 bg-emerald-500/20 text-emerald-400"
                          : item.run.status === "failed"
                            ? "border-rose-500/30 bg-rose-500/20 text-rose-400"
                            : "border-sky-500/30 bg-sky-500/20 text-sky-400"
                      }`}
                    >
                      ▶ run
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-sm text-zinc-200 leading-relaxed">
                        <span className="font-semibold">{item.run.blueprint}</span>
                        {item.run.input && (
                          <span className="text-zinc-500"> · {item.run.input}</span>
                        )}
                      </p>
                      <p className="mt-1 font-mono text-[10px] text-zinc-500">
                        {item.run.status} · {item.run.stepsDone}/{item.run.stepCount} steps · {formatRunDuration(item.run.durationMs)}
                        {item.run.stepsFailed > 0 && ` · ${item.run.stepsFailed} failed`}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="font-mono text-[10px] text-zinc-600">
                        {formatDate(item.run.startedAt)}
                      </span>
                      <span className="font-mono text-[10px] text-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity">
                        {item.run.project}
                      </span>
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
