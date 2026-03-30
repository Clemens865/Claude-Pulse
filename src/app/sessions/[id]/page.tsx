"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { use } from "react";

interface SessionInfo {
  id: string;
  project: string;
  startedAt: string;
  endedAt: string | null;
  duration: number;
  status: string;
  user: string | null;
  hostname: string | null;
}

interface EventInfo {
  id: number;
  toolName: string;
  timestamp: string;
  filePath: string | null;
  language: string | null;
  linesAdded: number;
  linesRemoved: number;
  command: string | null;
  detectedFramework: string | null;
  commandFailed: boolean;
  searchPattern: string | null;
  agentType: string | null;
  agentDescription: string | null;
  skillName: string | null;
  skillArgs: string | null;
  diffContent: string | null;
}

interface SessionData {
  session: SessionInfo;
  summary: {
    totalEvents: number;
    linesAdded: number;
    linesRemoved: number;
    netLines: number;
    uniqueFiles: number;
    uniqueTools: number;
  };
  events: EventInfo[];
}

const TOOL_COLORS: Record<string, string> = {
  Edit: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  Write: "bg-green-500/20 text-green-400 border-green-500/30",
  Read: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
  Bash: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  Glob: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  Grep: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  Agent: "bg-rose-500/20 text-rose-400 border-rose-500/30",
  Skill: "bg-violet-500/20 text-violet-400 border-violet-500/30",
};

function ToolBadge({ tool }: { tool: string }) {
  const color =
    TOOL_COLORS[tool] || "bg-zinc-500/20 text-zinc-400 border-zinc-500/30";
  return (
    <span
      className={`inline-block rounded border px-2 py-0.5 font-mono text-xs ${color}`}
    >
      {tool}
    </span>
  );
}

function KpiCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 p-4">
      <p className="font-mono text-xs uppercase tracking-wider text-zinc-500">
        {label}
      </p>
      <p className="mt-1 font-mono text-xl font-semibold text-zinc-50">
        {value}
      </p>
    </div>
  );
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatTime(iso: string): string {
  if (!iso) return "--";
  // Handle both "YYYY-MM-DD HH:MM:SS" and ISO formats
  const normalized = iso.includes("T") ? iso : iso.replace(" ", "T");
  const d = new Date(normalized);
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatDateFull(iso: string): string {
  if (!iso) return "--";
  const normalized = iso.includes("T") ? iso : iso.replace(" ", "T");
  const d = new Date(normalized);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function DiffView({ diff }: { diff: string }) {
  const [expanded, setExpanded] = useState(false);
  if (!diff) return null;
  return (
    <div className="mt-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="font-mono text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
      >
        {expanded ? "▾ hide diff" : "▸ show diff"}
      </button>
      {expanded && (
        <pre className="mt-1 max-h-48 overflow-auto rounded border border-zinc-800 bg-zinc-950 p-2 font-mono text-[11px] leading-relaxed">
          {diff.split("\n").map((line, i) => (
            <div
              key={i}
              className={
                line.startsWith("+++ ") ? "text-green-500 font-semibold" :
                line.startsWith("--- ") ? "text-red-500 font-semibold" :
                "text-zinc-400"
              }
            >
              {line}
            </div>
          ))}
        </pre>
      )}
    </div>
  );
}

function EventDetail({ event }: { event: EventInfo }) {
  const { toolName } = event;

  if (toolName === "Edit" || toolName === "Write") {
    return (
      <div className="flex flex-col gap-1">
        {event.filePath && (
          <span className="font-mono text-xs text-zinc-400">
            {event.filePath}
          </span>
        )}
        <span className="font-mono text-xs">
          <span className="text-green-400">+{event.linesAdded}</span>
          {" / "}
          <span className="text-red-400">-{event.linesRemoved}</span>
          {event.language && (
            <span className="ml-2 text-zinc-600">{event.language}</span>
          )}
        </span>
        {event.diffContent && <DiffView diff={event.diffContent} />}
      </div>
    );
  }

  if (toolName === "Bash") {
    return (
      <div className="flex flex-col gap-1">
        <code
          className={`font-mono text-xs ${
            event.commandFailed ? "text-red-400" : "text-zinc-300"
          }`}
        >
          $ {event.command || "--"}
        </code>
        {event.commandFailed && (
          <span className="font-mono text-xs text-red-500">FAILED</span>
        )}
      </div>
    );
  }

  if (toolName === "Read") {
    return (
      <span className="font-mono text-xs text-zinc-400">
        {event.filePath || "--"}
      </span>
    );
  }

  if (toolName === "Glob" || toolName === "Grep") {
    return (
      <span className="font-mono text-xs text-zinc-400">
        {event.searchPattern || "--"}
      </span>
    );
  }

  if (toolName === "Agent") {
    return (
      <div className="flex flex-col gap-1">
        <span className="font-mono text-xs text-rose-400">
          {event.agentType || "agent"}
        </span>
        {event.agentDescription && (
          <span className="font-mono text-xs text-zinc-500">
            {event.agentDescription}
          </span>
        )}
      </div>
    );
  }

  if (toolName === "Skill") {
    return (
      <span className="font-mono text-xs text-violet-400">
        {event.skillName || "--"}
        {event.skillArgs && (
          <span className="ml-2 text-zinc-500">{event.skillArgs}</span>
        )}
      </span>
    );
  }

  return (
    <span className="font-mono text-xs text-zinc-500">
      {event.filePath || event.command || "--"}
    </span>
  );
}

export default function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = useState<SessionData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/sessions/${encodeURIComponent(id)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) {
    return (
      <div className="space-y-4">
        <Link
          href="/"
          className="font-mono text-sm text-zinc-500 hover:text-zinc-300"
        >
          &larr; Back to Overview
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
          href="/"
          className="font-mono text-sm text-zinc-500 hover:text-zinc-300"
        >
          &larr; Back to Overview
        </Link>
        <h1 className="font-mono text-lg font-semibold">Session</h1>
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-lg border border-zinc-800 bg-zinc-900/50"
            />
          ))}
        </div>
      </div>
    );
  }

  const { session, summary, events } = data;

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link
          href={`/projects/${encodeURIComponent(session.project)}`}
          className="font-mono text-sm text-zinc-500 hover:text-zinc-300"
        >
          &larr; {session.project}
        </Link>
        <h1 className="font-mono text-lg font-semibold">Session Detail</h1>
      </div>

      {/* Session Info */}
      <div className="rounded-lg border border-zinc-800 p-5">
        <div className="grid grid-cols-4 gap-6 font-mono text-sm">
          <div>
            <p className="text-xs text-zinc-500">Project</p>
            <Link
              href={`/projects/${encodeURIComponent(session.project)}`}
              className="text-violet-400 hover:underline"
            >
              {session.project}
            </Link>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Started</p>
            <p className="text-zinc-300">
              {formatDateFull(session.startedAt)}
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Duration</p>
            <p className="text-zinc-300">
              {session.duration > 0 ? formatDuration(session.duration) : "--"}
            </p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Status</p>
            <p
              className={
                session.status === "completed"
                  ? "text-green-400"
                  : session.status === "active"
                    ? "text-yellow-400"
                    : "text-red-400"
              }
            >
              {session.status}
            </p>
          </div>
          {(session.user || session.hostname) && (
            <div>
              <p className="text-xs text-zinc-500">Identity</p>
              <p className="text-zinc-300">
                {session.user || "?"}@{session.hostname || "?"}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-6 gap-4">
        <KpiCard
          label="Events"
          value={summary.totalEvents.toLocaleString()}
        />
        <KpiCard
          label="Lines +"
          value={`+${summary.linesAdded.toLocaleString()}`}
        />
        <KpiCard
          label="Lines -"
          value={`-${summary.linesRemoved.toLocaleString()}`}
        />
        <KpiCard
          label="Net Lines"
          value={
            summary.netLines >= 0
              ? `+${summary.netLines.toLocaleString()}`
              : summary.netLines.toLocaleString()
          }
        />
        <KpiCard
          label="Files"
          value={summary.uniqueFiles.toLocaleString()}
        />
        <KpiCard
          label="Tools Used"
          value={summary.uniqueTools.toLocaleString()}
        />
      </div>

      {/* Event Timeline */}
      <div className="rounded-lg border border-zinc-800 p-5">
        <h2 className="mb-4 font-mono text-xs uppercase tracking-wider text-zinc-500">
          Event Timeline ({events.length} events)
        </h2>
        <div className="space-y-0">
          {events.map((event) => (
            <div
              key={event.id}
              className="flex items-start gap-4 border-b border-zinc-800/30 py-2.5"
            >
              <span className="w-20 shrink-0 font-mono text-xs text-zinc-600">
                {formatTime(event.timestamp)}
              </span>
              <div className="w-16 shrink-0">
                <ToolBadge tool={event.toolName} />
              </div>
              <div className="min-w-0 flex-1">
                <EventDetail event={event} />
              </div>
            </div>
          ))}
          {events.length === 0 && (
            <p className="py-4 text-center font-mono text-xs text-zinc-600">
              No events recorded
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
