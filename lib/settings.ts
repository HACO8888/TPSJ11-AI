import "server-only";
import { getSetting, setSetting } from "@/db/queries";
import { defaultTeams } from "./teams";
import type { Team } from "./types";

// The team list is admin-editable (app_settings key 'teams'); fall back to the
// built-in 72-team roster until it's customised. Cached briefly so hot paths don't
// hit the DB every call; the admin write clears the cache.
const TEAMS_KEY = "teams";
const TEAMS_TTL = 60_000; // ms

let teamsCache: { value: Team[]; exp: number } | null = null;

export async function getTeams(): Promise<Team[]> {
  const now = Date.now();
  if (teamsCache && teamsCache.exp > now) return teamsCache.value;
  const stored = await getSetting<Team[]>(TEAMS_KEY);
  const value = Array.isArray(stored) && stored.length > 0 ? stored : defaultTeams();
  teamsCache = { value, exp: now + TEAMS_TTL };
  return value;
}

export async function setTeams(teams: Team[]): Promise<void> {
  await setSetting(TEAMS_KEY, teams);
  teamsCache = null;
}

/** Invalidate the team cache (call after the admin writes the 'teams' setting). */
export function clearTeamsCache(): void {
  teamsCache = null;
}

/** Resolve a team by its code (e.g. "T01") from the current roster. */
export async function getTeamByCode(code: string): Promise<Team | null> {
  const teams = await getTeams();
  return teams.find((t) => t.code === code) ?? null;
}
