"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

export function useAuth() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const supabase = createClient();

    if (!supabase) {
      // Not configured — treat as unauthenticated but don't crash.
      queueMicrotask(() => {
        if (active) setLoading(false);
      });
      return;
    }

    async function load() {
      if (!supabase) return;
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        if (active) {
          setProfile(null);
          setLoading(false);
        }
        return;
      }

      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();

      if (active) {
        setProfile((profileData as Profile) ?? null);
        setLoading(false);
      }
    }

    load();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      load();
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function signOut() {
    const supabase = createClient();
    if (supabase) await supabase.auth.signOut();
    router.push("/login");
  }

  return { profile, loading, signOut, isSupabaseConfigured };
}
