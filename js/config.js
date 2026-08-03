const SUPABASE_URL =
  "https://usjcwqwpxjvtqnisdstg.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_3MTA3XNbtqblvWwkh_R0Rg_tJGCCBN0";

export const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);