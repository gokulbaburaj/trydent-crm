"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { AccessContext } from "@/lib/permissions";
import type { Profile } from "@/lib/types";

/** The role's grants, embedded alongside the profile in one request. */
type RoleGrants = { pages: string[] | null; is_admin: boolean | null };

export function useAuth() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [grants, setGrants] = useState<RoleGrants | null>(null);
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
          setGrants(null);
          setLoading(false);
        }
        return;
      }

      // The role's page grants come back in the same request via the
      // profiles.role_id foreign key — one round trip, not two, on the path
      // that gates every render of the shell.
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*, job_role:roles(pages, is_admin)")
        .eq("id", session.user.id)
        .single();

      if (active) {
        const row = profileData as (Profile & { job_role: RoleGrants | null }) | null;
        setProfile(row ?? null);
        setGrants(row?.job_role ?? null);
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

  /** Everything the permission helpers need, in one object to pass around. */
  const access: AccessContext = {
    role: profile?.role,
    grants: grants?.pages ?? null,
    roleIsAdmin: grants?.is_admin ?? null,
    portalOnly: profile?.portal_only ?? null,
  };

  return { profile, access, loading, signOut, isSupabaseConfigured };
}
