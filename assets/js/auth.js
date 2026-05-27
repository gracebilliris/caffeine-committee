import { getClient } from "./db.js";

const listeners = new Set();
let state = { user: null, profile: null };

export function getAuthState() { return state; }
export function onAuthChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { for (const fn of listeners) fn(state); }

async function loadProfile(user) {
  if (!user) return null;
  const c = getClient();
  const { data } = await c.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (data) return data;
  // First sign-in — create a profile row.
  const display = user.user_metadata?.display_name || user.email.split("@")[0];
  const { data: created } = await c
    .from("profiles")
    .insert({ id: user.id, display_name: display })
    .select()
    .single();
  return created;
}

export async function initAuth() {
  const c = getClient();
  const { data } = await c.auth.getSession();
  const user = data.session?.user ?? null;
  state = { user, profile: user ? await loadProfile(user) : null };
  emit();

  c.auth.onAuthStateChange(async (_event, session) => {
    const u = session?.user ?? null;
    state = { user: u, profile: u ? await loadProfile(u) : null };
    emit();
  });
}

export async function signInWithMagicLink(email) {
  const c = getClient();
  const { error } = await c.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.href.split("#")[0] },
  });
  if (error) throw error;
}

export async function signOut() {
  await getClient().auth.signOut();
}

export async function updateDisplayName(name) {
  if (!state.user) throw new Error("Not signed in");
  const c = getClient();
  const { data, error } = await c
    .from("profiles")
    .update({ display_name: name })
    .eq("id", state.user.id)
    .select()
    .single();
  if (error) throw error;
  state = { ...state, profile: data };
  emit();
}
