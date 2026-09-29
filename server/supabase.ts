import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "https://gpkiorasmdttbhimgreh.supabase.co";
const supabaseKey =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  "sb_publishable__WHhY6jKQ1e2yUFOXUTg3w_r_cmicNh";

/**
 * Initialized Supabase client for backend operations, data access, and user verification.
 */
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

export default supabase;
