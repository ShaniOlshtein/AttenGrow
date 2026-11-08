// API response shapes shared by several screens (mirror the server's JSON).
import type { Species } from "./bloom/Plant";

/** Plant growth computed on the server from focused time. */
export type Growth = {
  level: number;
  level_exact: number;
  progress: number;
  next_level_in: number | null;
  stage: string;
  blooms: number;
  focused_seconds: number;
};

export type SessionSummary = Growth & {
  id: string;
  content_id: string;
  content_title: string;
  content_type: string | null;
  bed: string | null;
  started_at: string;
  ended_at: string | null;
  reading_count: number;
  average_score: number | null;
  species: Species;
};

export type Reading = { score: number; position: number; created_at: string; attention?: number[] };
export type SessionDetail = SessionSummary & { readings: Reading[] };
export type Season = { key: string; name: string; emoji: string };
