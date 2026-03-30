/**
 * Core TypeScript interfaces for Claude Pulse data layer.
 */

export interface Session {
  id: string;
  project: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  summary: string | null;
  status: "active" | "completed" | "crashed";
  user: string | null;
  hostname: string | null;
}

export interface ToolEvent {
  id: number;
  session_id: string;
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
  metadata: string;
}

export interface DailySummary {
  id: number;
  date: string;
  project: string;
  session_count: number;
  total_duration_seconds: number;
  lines_added: number;
  lines_removed: number;
  net_lines: number;
  files_created: number;
  files_edited: number;
  files_read: number;
  tool_calls: number;
  bash_commands: number;
  bash_failures: number;
  searches: number;
  agents_spawned: number;
  skills_used: string; // JSON: { "skill_name": count }
  frameworks_detected: string; // JSON: { "framework": count }
  languages: string; // JSON: { "language": count }
  tool_counts: string; // JSON: { "tool_name": count }
}

export interface Insight {
  id: number;
  session_id: string | null;
  project: string;
  type: "progress" | "decision" | "pattern" | "fix" | "context" | "blocked";
  content: string;
  reasoning: string | null;
  created_at: string;
}

export interface FileActivity {
  id: number;
  file_path: string;
  project: string;
  date: string;
  edit_count: number;
  write_count: number;
  read_count: number;
  lines_added: number;
  lines_removed: number;
  language: string | null;
}

/** Aggregate metrics for the overview dashboard. */
export interface OverviewMetrics {
  total_sessions: number;
  total_tool_calls: number;
  total_lines_added: number;
  total_lines_removed: number;
  net_lines: number;
  total_duration_seconds: number;
  total_files_touched: number;
  active_projects: number;
  top_tools: Record<string, number>;
  top_languages: Record<string, number>;
  top_frameworks: Record<string, number>;
  daily_trend: Array<{
    date: string;
    tool_calls: number;
    lines_added: number;
    lines_removed: number;
    sessions: number;
  }>;
}

/** Per-project metrics for the project detail dashboard. */
export interface ProjectMetrics {
  project: string;
  total_sessions: number;
  total_tool_calls: number;
  total_lines_added: number;
  total_lines_removed: number;
  net_lines: number;
  total_duration_seconds: number;
  first_seen: string;
  last_active: string;
  top_files: Array<{
    file_path: string;
    edit_count: number;
    lines_added: number;
  }>;
  tool_distribution: Record<string, number>;
  language_distribution: Record<string, number>;
  framework_usage: Record<string, number>;
  recent_sessions: Array<{
    id: string;
    started_at: string;
    duration_seconds: number | null;
    status: string;
    tool_calls: number;
  }>;
}
