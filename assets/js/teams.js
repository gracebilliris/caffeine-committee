import { getClient } from "./db.js";
import { getAuthState, onAuthChange } from "./auth.js";

const listeners = new Set();
let cache = { teams: [], myMemberships: [] };

export function getTeamsState() { return cache; }
export function onTeamsChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { for (const fn of listeners) fn(cache); }

let channel = null;

export async function initTeams() {
  await reload();
  onAuthChange(() => reload());

  const c = getClient();
  if (channel) c.removeChannel(channel);
  channel = c
    .channel("teams-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "teams" }, () => reload())
    .on("postgres_changes", { event: "*", schema: "public", table: "team_members" }, () => reload())
    .subscribe();
}

async function reload() {
  const c = getClient();
  const { user } = getAuthState();

  const [{ data: teams }, { data: memberships }] = await Promise.all([
    c.from("teams").select("*").order("name"),
    user
      ? c.from("team_members").select("team_id").eq("user_id", user.id)
      : Promise.resolve({ data: [] }),
  ]);

  cache = {
    teams: teams || [],
    myMemberships: (memberships || []).map((m) => m.team_id),
  };
  emit();
}

export async function createTeam(name) {
  const c = getClient();
  const { user } = getAuthState();
  if (!user) throw new Error("Sign in to create a team");
  const cleanName = name.trim();
  if (!cleanName) throw new Error("Team name required");

  const { data: team, error } = await c
    .from("teams")
    .insert({ name: cleanName, created_by: user.id })
    .select()
    .single();
  if (error) throw error;

  const { error: mErr } = await c
    .from("team_members")
    .insert({ team_id: team.id, user_id: user.id });
  if (mErr) throw mErr;

  await reload();
  return team;
}

export async function joinByCode(code) {
  const c = getClient();
  const { user } = getAuthState();
  if (!user) throw new Error("Sign in to join a team");
  const clean = code.trim().toLowerCase();
  if (!clean) throw new Error("Join code required");

  const { data: team, error } = await c
    .from("teams")
    .select("*")
    .eq("join_code", clean)
    .maybeSingle();
  if (error) throw error;
  if (!team) throw new Error("No team matches that code");

  const { error: mErr } = await c
    .from("team_members")
    .insert({ team_id: team.id, user_id: user.id });
  // If already a member, treat as success.
  if (mErr && !`${mErr.message}`.includes("duplicate")) throw mErr;

  await reload();
  return team;
}

export async function leaveTeam(teamId) {
  const c = getClient();
  const { user } = getAuthState();
  if (!user) return;
  const { error } = await c
    .from("team_members")
    .delete()
    .eq("team_id", teamId)
    .eq("user_id", user.id);
  if (error) throw error;
  await reload();
}

export function teamById(id) {
  return cache.teams.find((t) => t.id === id) || null;
}
