"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { use } from "react";

interface ProjectData {
  project: string;
  kpis: {
    sessions: number;
    duration: number;
    linesAdded: number;
    linesRemoved: number;
    netLines: number;
    files: number;
    agents: number;
  };
  dailyActivity: Array<{
    date: string;
    sessions: number;
    duration: number;
    linesAdded: number;
    linesRemoved: number;
    netLines: number;
    files: number;
    filesRead: number;
    tools: number;
    agents: number;
  }>;
  topFiles: Array<{
    filePath: string;
    edits: number;
    writes: number;
    linesAdded: number;
    linesRemoved: number;
    language: string | null;
  }>;
  recentSessions: Array<{
    id: string;
    startedAt: string;
    endedAt: string | null;
    duration: number;
    summary: string | null;
    status: string;
    tools: number;
    lines: number;
  }>;
  recentRuns?: Array<{
    id: string;
    blueprint: string;
    input: string | null;
    status: "running" | "completed" | "failed";
    startedAt: string;
    durationMs: number | null;
    stepCount: number;
    stepsDone: number;
    stepsFailed: number;
    worktreeBranch: string | null;
    sessionId: string | null;
  }>;
  runStats?: { total: number; completed: number; failed: number };
}

function KpiCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 p-5">
      <p className="font-mono text-xs uppercase tracking-wider text-zinc-500">
        {label}
      </p>
      <p className="mt-2 font-mono text-2xl font-semibold text-zinc-50">
        {value}
      </p>
      {sub && (
        <p className="mt-1 font-mono text-xs text-zinc-600">{sub}</p>
      )}
    </div>
  );
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatDate(iso: string): string {
  if (!iso) return "--";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = use(params);
  const projectName = decodeURIComponent(name);
  const [data, setData] = useState<ProjectData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/projects/${encodeURIComponent(projectName)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message));
  }, [projectName]);

  if (error) {
    return (
      <div className="space-y-4">
        <Link
          href="/projects"
          className="font-mono text-sm text-zinc-500 hover:text-zinc-300"
        >
          &larr; Back to Projects
        </Link>
        <div className="rounded-lg border border-red-900/50 bg-red-950/20 p-6">
          <p className="font-mono text-sm text-red-400">
            Failed to load: {error}
          </p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <Link
          href="/projects"
          className="font-mono text-sm text-zinc-500 hover:text-zinc-300"
        >
          &larr; Back to Projects
        </Link>
        <h1 className="font-mono text-lg font-semibold">{projectName}</h1>
        <div className="grid grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-lg border border-zinc-800 bg-zinc-900/50"
            />
          ))}
        </div>
      </div>
    );
  }

  const { kpis, dailyActivity, topFiles, recentSessions } = data;
  const recentRuns = data.recentRuns ?? [];
  const runStats = data.runStats ?? { total: 0, completed: 0, failed: 0 };

  const formatRunDuration = (ms: number | null) => {
    if (ms === null) return "—";
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
    const m = Math.floor(ms / 60_000);
    const s = Math.floor((ms % 60_000) / 1000);
    return `${m}m ${s}s`;
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link
          href="/projects"
          className="font-mono text-sm text-zinc-500 hover:text-zinc-300"
        >
          &larr; Back
        </Link>
        <h1 className="font-mono text-lg font-semibold">{projectName}</h1>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-5 gap-4">
        <KpiCard
          label="Sessions"
          value={kpis.sessions.toLocaleString()}
        />
        <KpiCard
          label="Total Time"
          value={formatDuration(kpis.duration)}
        />
        <KpiCard
          label="Net Lines"
          value={
            kpis.netLines >= 0
              ? `+${kpis.netLines.toLocaleString()}`
              : kpis.netLines.toLocaleString()
          }
          sub={`+${kpis.linesAdded.toLocaleString()} / -${kpis.linesRemoved.toLocaleString()}`}
        />
        <KpiCard
          label="Files Touched"
          value={kpis.files.toLocaleString()}
        />
        <KpiCard
          label="Agents Spawned"
          value={kpis.agents.toLocaleString()}
        />
      </div>

      {/* Daily Activity */}
      <div className="rounded-lg border border-zinc-800 p-5">
        <h2 className="mb-4 font-mono text-xs uppercase tracking-wider text-zinc-500">
          Daily Activity (Last 14 Days)
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full font-mono text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                <th className="pb-2 pr-6">Date</th>
                <th className="pb-2 pr-6 text-right">Sessions</th>
                <th className="pb-2 pr-6 text-right">Duration</th>
                <th className="pb-2 pr-6 text-right">Lines +/-</th>
                <th className="pb-2 pr-6 text-right">Files</th>
                <th className="pb-2 text-right">Tools</th>
              </tr>
            </thead>
            <tbody>
              {dailyActivity.map((day) => (
                <tr
                  key={day.date}
                  className="border-b border-zinc-800/50 text-zinc-300"
                >
                  <td className="py-2 pr-6">{formatDate(day.date)}</td>
                  <td className="py-2 pr-6 text-right">{day.sessions}</td>
                  <td className="py-2 pr-6 text-right">
                    {formatDuration(day.duration)}
                  </td>
                  <td className="py-2 pr-6 text-right">
                    <span className="text-green-400">+{day.linesAdded}</span>
                    {" / "}
                    <span className="text-red-400">-{day.linesRemoved}</span>
                  </td>
                  <td className="py-2 pr-6 text-right">{day.files}</td>
                  <td className="py-2 text-right">{day.tools}</td>
                </tr>
              ))}
              {dailyActivity.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="py-4 text-center text-xs text-zinc-600"
                  >
                    No activity recorded
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Most Edited Files */}
      <div className="rounded-lg border border-zinc-800 p-5">
        <h2 className="mb-4 font-mono text-xs uppercase tracking-wider text-zinc-500">
          Most Edited Files (Top 10)
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full font-mono text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                <th className="pb-2 pr-6">File</th>
                <th className="pb-2 pr-6">Language</th>
                <th className="pb-2 pr-6 text-right">Edits</th>
                <th className="pb-2 pr-6 text-right">Lines +</th>
                <th className="pb-2 text-right">Lines -</th>
              </tr>
            </thead>
            <tbody>
              {topFiles.map((f) => (
                <tr
                  key={f.filePath}
                  className="border-b border-zinc-800/50 text-zinc-300"
                >
                  <td className="max-w-xs truncate py-2 pr-6 text-violet-400">
                    {f.filePath}
                  </td>
                  <td className="py-2 pr-6 text-zinc-500">
                    {f.language || "--"}
                  </td>
                  <td className="py-2 pr-6 text-right">{f.edits}</td>
                  <td className="py-2 pr-6 text-right text-green-400">
                    +{f.linesAdded}
                  </td>
                  <td className="py-2 text-right text-red-400">
                    -{f.linesRemoved}
                  </td>
                </tr>
              ))}
              {topFiles.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="py-4 text-center text-xs text-zinc-600"
                  >
                    No file activity recorded
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Blueprint Runs — Lazy-Fetch executions */}
      {runStats.total > 0 && (
        <div className="rounded-lg border border-zinc-800 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-mono text-xs uppercase tracking-wider text-zinc-500">
              Blueprint Runs ({runStats.total})
            </h2>
            <div className="flex items-center gap-3 font-mono text-xs">
              <span className="text-emerald-400/80">
                ✓ {runStats.completed}
              </span>
              {runStats.failed > 0 && (
                <span className="text-rose-400/80">✗ {runStats.failed}</span>
              )}
              <Link
                href="/runs"
                className="text-violet-400 hover:underline"
              >
                view all →
              </Link>
            </div>
          </div>
          <div className="space-y-2">
            {recentRuns.map((r) => (
              <div
                key={r.id}
                className="flex items-start gap-3 rounded border border-zinc-800/50 px-3 py-2 transition-colors hover:border-zinc-700"
              >
                <span
                  className={`mt-0.5 inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
                    r.status === "completed"
                      ? "border-emerald-500/30 bg-emerald-500/20 text-emerald-400"
                      : r.status === "failed"
                        ? "border-rose-500/30 bg-rose-500/20 text-rose-400"
                        : "border-sky-500/30 bg-sky-500/20 text-sky-400"
                  }`}
                >
                  {r.status === "completed" && "✓"}
                  {r.status === "failed" && "✗"}
                  {r.status === "running" && "◐"} {r.status}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-sm font-semibold text-zinc-200">
                      {r.blueprint}
                    </span>
                    {r.input && (
                      <span className="font-mono text-xs text-zinc-500 truncate">
                        {r.input}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 font-mono text-[10px] text-zinc-500">
                    <span>
                      {r.stepsDone}/{r.stepCount} steps
                      {r.stepsFailed > 0 && ` · ${r.stepsFailed} failed`}
                    </span>
                    <span>·</span>
                    <span>{formatRunDuration(r.durationMs)}</span>
                    {r.worktreeBranch && (
                      <>
                        <span>·</span>
                        <span className="text-zinc-600">
                          ⎇ {r.worktreeBranch.replace(/^lazy\/bp-/, "")}
                        </span>
                      </>
                    )}
                    {r.sessionId && (
                      <>
                        <span>·</span>
                        <Link
                          href={`/sessions/${encodeURIComponent(r.sessionId)}`}
                          className="text-violet-400 hover:underline"
                        >
                          session
                        </Link>
                      </>
                    )}
                  </div>
                </div>
                <span className="font-mono text-[10px] text-zinc-600">
                  {formatDate(r.startedAt)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Session Log — summaries written by Claude */}
      <div className="rounded-lg border border-zinc-800 p-5">
        <h2 className="mb-4 font-mono text-xs uppercase tracking-wider text-zinc-500">
          Session Log
        </h2>
        <div className="space-y-3">
          {recentSessions.map((s) => (
            <div
              key={s.id}
              className="rounded border border-zinc-800/50 p-4 transition-colors hover:border-zinc-700"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Link
                    href={`/sessions/${encodeURIComponent(s.id)}`}
                    className="font-mono text-sm text-violet-400 hover:underline"
                  >
                    {formatDate(s.startedAt)}
                  </Link>
                  <span className="font-mono text-xs text-zinc-600">
                    {s.duration > 0 ? formatDuration(s.duration) : "--"}
                  </span>
                  <span
                    className={`font-mono text-xs ${
                      s.lines >= 0 ? "text-green-400/70" : "text-red-400/70"
                    }`}
                  >
                    {s.lines >= 0 ? `+${s.lines}` : s.lines} lines
                  </span>
                  <span className="font-mono text-xs text-zinc-600">
                    {s.tools} tools
                  </span>
                </div>
                <span
                  className={`font-mono text-xs ${
                    s.status === "completed"
                      ? "text-green-400/60"
                      : s.status === "active"
                        ? "text-yellow-400/60"
                        : "text-red-400/60"
                  }`}
                >
                  {s.status}
                </span>
              </div>
              {s.summary && (
                <p className="mt-2 font-mono text-sm leading-relaxed text-zinc-300">
                  {s.summary}
                </p>
              )}
              {!s.summary && s.status === "completed" && (
                <p className="mt-2 font-mono text-xs italic text-zinc-600">
                  No summary recorded
                </p>
              )}
            </div>
          ))}
          {recentSessions.length === 0 && (
            <p className="py-4 text-center font-mono text-xs text-zinc-600">
              No sessions recorded
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
