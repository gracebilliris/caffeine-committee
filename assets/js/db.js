import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { supabaseUrl, supabaseAnonKey, isConfigured } from "./config.js";

let client = null;
if (isConfigured()) {
  client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    realtime: { params: { eventsPerSecond: 5 } },
  });
}

export function getClient() {
  if (!client) throw new Error("Supabase not configured");
  return client;
}

function normalize(row) {
  const seconds = row.created_at
    ? Math.floor(new Date(row.created_at).getTime() / 1000)
    : 0;
  return {
    id: row.id,
    cafe_name: row.cafe_name,
    address: row.address ?? "",
    lat: Number(row.lat),
    lng: Number(row.lng),
    rating: Number(row.rating),
    by: row.by,
    user_id: row.user_id ?? null,
    team_id: row.team_id ?? null,
    team: row.team ?? null,
    taste:   row.taste   ?? null,
    price:   row.price   ?? null,
    vibes:   row.vibes   ?? null,
    service: row.service ?? null,
    comment: row.comment ?? "",
    created_at: { seconds },
  };
}

async function fetchAll() {
  const { data, error } = await client
    .from("ratings")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map(normalize);
}

export function subscribeRatings(onData, onError) {
  if (!client) {
    onError?.(new Error("Supabase not configured"));
    return () => {};
  }

  let cancelled = false;
  const refresh = async () => {
    try {
      const ratings = await fetchAll();
      if (!cancelled) onData(ratings);
    } catch (e) {
      if (!cancelled) onError?.(e);
    }
  };

  refresh();

  const channel = client
    .channel("ratings-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "ratings" }, () => refresh())
    .subscribe();

  return () => {
    cancelled = true;
    client.removeChannel(channel);
  };
}

export async function addRating(data, { userId = null, teamId = null } = {}) {
  if (!client) throw new Error("Supabase not configured");
  const row = {
    cafe_name: data.cafe_name,
    address: data.address,
    lat: data.lat,
    lng: data.lng,
    rating: data.rating,
    by: data.by,
    user_id: userId,
    team_id: teamId,
    comment: data.comment || null,
  };
  for (const k of ["taste", "price", "vibes", "service"]) {
    if (Number.isFinite(data[k]) && data[k] > 0) row[k] = data[k];
  }
  const { error } = await client.from("ratings").insert(row);
  if (error) throw error;
}
