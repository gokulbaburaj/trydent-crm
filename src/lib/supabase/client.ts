"use client";

import { createBrowserClient } from "@supabase/ssr";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

/**
 * Returns a browser Supabase client, or null if env vars are not configured.
 * Guarded so the app can build/run without live credentials.
 */
export function createClient() {
  if (!isSupabaseConfigured) return null;
  if (!browserClient) {
    browserClient = createBrowserClient(url as string, anonKey as string);
  }
  return browserClient;
}
