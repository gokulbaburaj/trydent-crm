"use client";

import { useCallback, useMemo } from "react";
import { toast } from "@/components/Toaster";
import { createClient } from "@/lib/supabase/client";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { useStaffProfiles } from "@/lib/useStaffProfiles";
import type { OnboardingTemplate, Profile, Role, Team } from "@/lib/types";

/**
 * Teams and roles, and the writes that keep them consistent.
 *
 * This lives in one place because a team name is stored in three: `teams.name`,
 * `profiles.team` and `roles.team`. Postgres has no foreign key tying them
 * together — teams arrived after the other two and the column was never
 * migrated to an id. Every rename and delete therefore has to fan out by hand,
 * and the first two times that logic was written it was written twice and one
 * copy forgot `roles.team`, which left roles pointing at a team that no longer
 * existed and made the rename look like it half-worked.
 *
 * Now the Settings summary, the list pages and the detail pages all call the
 * same functions. If the schema ever grows a real `team_id`, this is the only
 * file that changes.
 */
export function useOrgAdmin() {
  const teamsTable = useSupabaseTable<Team>("teams", {
    column: "name",
    ascending: true,
  });
  const rolesTable = useSupabaseTable<Role>("roles", {
    column: "sort_order",
    ascending: true,
  });
  const { rows: templates } = useSupabaseTable<OnboardingTemplate>("onboarding_templates");
  const { rows: staff } = useStaffProfiles();

  const { rows: teams, setRows: setTeams } = teamsTable;
  const { rows: roles, setRows: setRoles } = rolesTable;

  const loading = teamsTable.loading || rolesTable.loading;

  /** Names only — for the dropdowns that still store a team as text. */
  const teamNames = useMemo(() => teams.map((t) => t.name), [teams]);

  const staffInTeam = useCallback(
    (team: string): Profile[] => staff.filter((p) => p.team === team),
    [staff]
  );
  const rolesInTeam = useCallback(
    (team: string): Role[] => roles.filter((r) => r.team === team),
    [roles]
  );
  const staffWithRole = useCallback(
    (roleId: string): Profile[] => staff.filter((p) => p.role_id === roleId),
    [staff]
  );

  // ── Roles ──────────────────────────────────────────────────────────────

  const addRole = useCallback(
    async (name: string, team: string | null): Promise<Role | null> => {
      const n = name.trim();
      if (!n) return null;
      const supabase = createClient();
      if (!supabase) return null;
      const { data, error } = await supabase
        .from("roles")
        // A new role starts with the baseline rather than nothing — an empty
        // grant list means whoever gets it signs in to an app with no sidebar.
        .insert({
          name: n,
          team: team?.trim() || null,
          pages: ["projects", "schedule"],
          sort_order: roles.length,
        })
        .select()
        .single();
      if (error || !data) {
        toast.error(
          error?.message.includes("duplicate")
            ? "That role already exists."
            : `Couldn't add: ${error?.message ?? "unknown error"}`
        );
        return null;
      }
      setRoles((prev) => [...prev, data as Role]);
      return data as Role;
    },
    [roles.length, setRoles]
  );

  const updateRole = useCallback(
    async (id: string, patch: Partial<Role>) => {
      const before = roles;
      setRoles((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
      const supabase = createClient();
      if (!supabase) return;
      const { error } = await supabase.from("roles").update(patch).eq("id", id);
      if (error) {
        setRoles(before);
        toast.error(`Couldn't save: ${error.message}`);
      }
    },
    [roles, setRoles]
  );

  const deleteRole = useCallback(
    async (id: string): Promise<boolean> => {
      if (staffWithRole(id).length > 0) {
        toast.error("Someone still holds this role. Move them first.");
        return false;
      }
      const before = roles;
      setRoles((prev) => prev.filter((r) => r.id !== id));
      const supabase = createClient();
      if (!supabase) return false;
      const { error } = await supabase.from("roles").delete().eq("id", id);
      if (error) {
        setRoles(before);
        toast.error(`Couldn't delete: ${error.message}`);
        return false;
      }
      return true;
    },
    [roles, setRoles, staffWithRole]
  );

  // ── Teams ──────────────────────────────────────────────────────────────

  const addTeam = useCallback(
    async (name: string): Promise<Team | null> => {
      const n = name.trim();
      if (!n) return null;
      if (teams.some((t) => t.name.toLowerCase() === n.toLowerCase())) {
        toast.error(`"${n}" already exists.`);
        return null;
      }
      const supabase = createClient();
      if (!supabase) return null;
      const { data, error } = await supabase.from("teams").insert({ name: n }).select().single();
      if (error || !data) {
        toast.error(`Couldn't add: ${error?.message ?? "unknown error"}`);
        return null;
      }
      setTeams((prev) => [...prev, data as Team]);
      return data as Team;
    },
    [teams, setTeams]
  );

  const renameTeam = useCallback(
    async (team: Team, next: string): Promise<boolean> => {
      const n = next.trim();
      if (!n || n === team.name) return false;
      if (teams.some((t) => t.id !== team.id && t.name.toLowerCase() === n.toLowerCase())) {
        toast.error(`"${n}" already exists.`);
        return false;
      }
      const supabase = createClient();
      if (!supabase) return false;
      const { error } = await supabase.from("teams").update({ name: n }).eq("id", team.id);
      if (error) {
        toast.error(`Couldn't rename: ${error.message}`);
        return false;
      }
      // Carry everyone and every role across, or they're left pointing at a
      // name that no longer exists.
      await supabase.from("profiles").update({ team: n }).eq("team", team.name);
      await supabase.from("roles").update({ team: n }).eq("team", team.name);
      setTeams((prev) => prev.map((t) => (t.id === team.id ? { ...t, name: n } : t)));
      setRoles((prev) => prev.map((r) => (r.team === team.name ? { ...r, team: n } : r)));
      toast.success(`Renamed to "${n}"`);
      return true;
    },
    [teams, setTeams, setRoles]
  );

  const deleteTeam = useCallback(
    async (team: Team): Promise<boolean> => {
      const before = teams;
      setTeams((prev) => prev.filter((t) => t.id !== team.id));
      const supabase = createClient();
      if (!supabase) return false;
      const { error } = await supabase.from("teams").delete().eq("id", team.id);
      if (error) {
        // Checked, because a delete that fails silently is indistinguishable
        // from one that worked until you reload the page.
        setTeams(before);
        toast.error(`Couldn't delete: ${error.message}`);
        return false;
      }
      // Nobody is removed and no role is deleted — they just lose the team.
      await supabase.from("profiles").update({ team: null }).eq("team", team.name);
      await supabase.from("roles").update({ team: null }).eq("team", team.name);
      setRoles((prev) => prev.map((r) => (r.team === team.name ? { ...r, team: null } : r)));
      return true;
    },
    [teams, setTeams, setRoles]
  );

  return {
    loading,
    teams,
    teamNames,
    roles,
    templates,
    staff,
    staffInTeam,
    rolesInTeam,
    staffWithRole,
    addRole,
    updateRole,
    deleteRole,
    addTeam,
    renameTeam,
    deleteTeam,
  };
}
