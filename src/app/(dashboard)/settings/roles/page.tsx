"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Plus, ShieldCheck, Users } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { TableSkeleton } from "@/components/ui/Skeletons";
import { RequireAdmin } from "@/components/RequireAdmin";
import { SettingsBackLink } from "@/components/SettingsBackLink";
import { useOrgAdmin } from "@/lib/useOrgAdmin";
import { staggerDelay } from "@/lib/motion";

export default function RolesPage() {
  return (
    <RequireAdmin>
      <RolesInner />
    </RequireAdmin>
  );
}

function RolesInner() {
  const {
    loading,
    roles,
    teamNames,
    templates,
    staffWithRole,
    addRole,
  } = useOrgAdmin();
  const [name, setName] = useState("");
  const [team, setTeam] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const created = await addRole(name, team || null);
    setBusy(false);
    if (created) {
      setName("");
      setTeam("");
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-5">
      <div>
        <SettingsBackLink />
        <h2 className="mt-2 text-xl font-semibold tracking-tight">Company roles</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          The job list your whole app reads from. A role sets someone&apos;s team, the
          onboarding checklist they get when hired, and which pages they can open.
        </p>
      </div>

      <Card>
        {loading ? (
          <TableSkeleton rows={4} />
        ) : roles.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No roles yet. Add the jobs you hire for.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {roles.map((r, i) => {
              const people = staffWithRole(r.id).length;
              const pageCount = (r.pages ?? []).length;
              const checklist = templates.find((t) => t.id === r.template_id) ?? null;
              return (
                <Link
                  key={r.id}
                  href={`/settings/roles/${r.id}`}
                  style={staggerDelay(i)}
                  className="animate-row group flex items-center gap-2.5 rounded-lg border border-border-subtle px-3 py-2.5 transition-colors hover:border-border hover:bg-surface-fill"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[13.5px] font-medium">{r.name}</span>
                      {r.team ? (
                        <span className="rounded border border-border-subtle px-1.5 py-0.5 text-[11px] text-muted-foreground">
                          {r.team}
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted-2">No team</span>
                      )}
                    </div>
                    {/* Only when set — a row of "No checklist" is noise pretending
                        to be information. */}
                    {checklist && (
                      <p className="mt-0.5 truncate text-[11.5px] text-muted-2">
                        Onboards with {checklist.name}
                      </p>
                    )}
                  </div>

                  <span
                    className={`flex shrink-0 items-center gap-1 text-[11.5px] ${
                      r.is_admin ? "text-warning" : "text-muted-foreground"
                    }`}
                  >
                    <ShieldCheck className="h-3 w-3" />
                    {r.is_admin ? "Full admin" : `${pageCount} page${pageCount === 1 ? "" : "s"}`}
                  </span>
                  <span className="flex w-20 shrink-0 items-center justify-end gap-1 text-[11.5px] text-muted-2">
                    <Users className="h-3 w-3" />
                    {people}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-2 transition-transform group-hover:translate-x-0.5" />
                </Link>
              );
            })}
          </div>
        )}

        <form onSubmit={submit} className="mt-3 flex flex-wrap items-center gap-2">
          <Input
            placeholder="New role name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="min-w-[10rem] flex-1"
          />
          <div className="w-44">
            <Dropdown
              value={team}
              placeholder="No team"
              options={[
                { value: "", label: "No team" },
                ...teamNames.map((t) => ({ value: t, label: t })),
              ]}
              onChange={setTeam}
            />
          </div>
          <Button type="submit" size="sm" variant="secondary" disabled={busy || !name.trim()}>
            <Plus className="h-3.5 w-3.5" /> Add role
          </Button>
        </form>
      </Card>
    </div>
  );
}
