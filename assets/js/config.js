// Paste your Supabase project values here.
// Project Settings → API in the Supabase dashboard.
// The anon key is safe to expose publicly — Row Level Security protects writes.

export const supabaseUrl = "https://qjnwifixdyfqwjqpeumv.supabase.co";
export const supabaseAnonKey = "sb_publishable_UGcKp8aPPfAS0LTHF0lVAQ_GIYzGoki";

// 50 Martin Place, Sydney — default map center & distance origin.
export const MARTIN_PLACE = { lat: -33.86753, lng: 151.20704 };

export const DEFAULT_ZOOM = 16;

export function isConfigured() {
  return (
    supabaseUrl &&
    supabaseUrl !== "REPLACE_ME" &&
    supabaseAnonKey &&
    supabaseAnonKey !== "REPLACE_ME"
  );
}
