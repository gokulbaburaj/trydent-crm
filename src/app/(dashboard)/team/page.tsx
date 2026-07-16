"use client";

import { DataTable, Column } from "@/components/DataTable";
import { PersonCell } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Dropdown } from "@/components/ui/Dropdown";
import { useSupabaseTable } from "@/lib/useSupabaseTable";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/useAuth";
import { formatDate } from "@/lib/utils";
import type { Profile, UserRole } from "@/lib/types";

const roleTone: Record<UserRole, "green" | "blue" | "gray"> = {
  admin: "green",
  rep: "blue",
  client: "gray",
};

export default function TeamPage() {
  const { profile: me } = useAuth();
  const { rows: profiles, setRows } = useSupabaseTable<Profile>(
    "profiles",
    { column: "full_name", ascending: true }
  );

  const isAdmin = me?.role === "admin";

  async function updateRole(id: string, role: UserRole) {
    setRows((prev) => prev.map((p) => (p.id === id ? { ...p, role } : p)));
    const supabase = createClient();
    if (!supabase) return;
    await supabase.from("profiles").update({ role }).eq("id", id);
  }

  const columns: Column<Profile>[] = [
    {
      header: "Name",
      render: (p) => <PersonCell name={p.full_name} subtitle={p.email} url={p.avatar_url} />,
    },
    {
      header: "Role",
      render: (p) =>
        isAdmin ? (
          <div className="w-32" onClick={(e) => e.stopPropagation()}>
            <Dropdown
              value={p.role}
              options={[
                { value: "admin", label: "Admin" },
                { value: "rep", label: "Rep" },
                { value: "client", label: "Client" },
              ]}
              onChange={(v) => updateRole(p.id, v as UserRole)}
            />
          </div>
        ) : (
          <Badge tone={roleTone[p.role]}>{p.role}</Badge>
        ),
    },
    { header: "Joined", render: (p) => formatDate(p.created_at) },
  ];

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">
        {isAdmin
          ? "As an admin, you can change team member roles."
          : "Only admins can edit roles."}
      </p>
      <DataTable columns={columns} rows={profiles} rowKey={(p) => p.id} emptyMessage="No team members yet." />
    </div>
  );
}
