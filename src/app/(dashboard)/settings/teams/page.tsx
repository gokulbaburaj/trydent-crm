"use client";

import { useState } from "react";
import Link from "next/link";
import { Briefcase, ChevronRight, Plus, Users } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { TableSkeleton } from "@/components/ui/Skeletons";
import { RequireAdmin } from "@/components/RequireAdmin";
import { SettingsBackLink } from "@/components/SettingsBackLink";
import { useOrgAdmin } from "@/lib/useOrgAdmin";
import { staggerDelay } from "@/lib/motion";

export default function TeamsPage() {
  return (
    <RequireAdmin>
      <TeamsInner />
    </RequireAdmin>
  );
}

function TeamsInner() {
  const { loading, teams, staffInTeam, rolesInTeam, addTeam } = useOrgAdmin();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const created = await addTeam(name);
    setBusy(false);
    if (created) setName("");
  }

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-5">
      <div>
        <SettingsBackLink />
        <h2 className="mt-2 text-xl font-semibold tracking-tight">Teams</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          The groups roles and people belong to. Renaming one moves everybody on it.
        </p>
      </div>

      <Card>
        {loading ? (
          <TableSkeleton rows={4} />
        ) : teams.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No teams yet.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {teams.map((t, i) => {
              const people = staffInTeam(t.name).length;
              const jobs = rolesInTeam(t.name).length;
              return (
                <Link
                  key={t.id}
                  href={`/settings/teams/${t.id}`}
                  style={staggerDelay(i)}
                  className="animate-row group flex items-center gap-2.5 rounded-lg border border-border-subtle px-3 py-2.5 transition-colors hover:border-border hover:bg-white/[0.03]"
                >
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
                    {t.name}
                  </span>
                  <span className="flex shrink-0 items-center gap-1 text-[11.5px] text-muted-foreground">
                    <Users className="h-3 w-3" />
                    {people} {people === 1 ? "person" : "people"}
                  </span>
                  <span className="flex w-24 shrink-0 items-center justify-end gap-1 text-[11.5px] text-muted-2">
                    <Briefcase className="h-3 w-3" />
                    {jobs} {jobs === 1 ? "role" : "roles"}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-2 transition-transform group-hover:translate-x-0.5" />
                </Link>
              );
            })}
          </div>
        )}

        <form onSubmit={submit} className="mt-3 flex items-center gap-2">
          <Input
            placeholder="New team name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" size="sm" variant="secondary" disabled={busy || !name.trim()}>
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        </form>
      </Card>
    </div>
  );
}
