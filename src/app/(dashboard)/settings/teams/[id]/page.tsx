"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChevronRight, ShieldCheck, Trash2, UserX } from "lucide-react";
import { toast } from "@/components/Toaster";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { Input, Label } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/Skeletons";
import { RequireAdmin } from "@/components/RequireAdmin";
import { SettingsBackLink } from "@/components/SettingsBackLink";
import { useOrgAdmin } from "@/lib/useOrgAdmin";
import { USER_ROLE_LABELS } from "@/lib/types";
import { confirmAction } from "@/components/ui/ConfirmDialog";

export default function TeamDetailPage() {
  return (
    <RequireAdmin>
      <TeamDetailInner />
    </RequireAdmin>
  );
}

function TeamDetailInner() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { loading, teams, staffInTeam, rolesInTeam, renameTeam, deleteTeam } = useOrgAdmin();
  const [deleting, setDeleting] = useState(false);

  const team = teams.find((t) => t.id === params.id) ?? null;

  if (loading) return <TableSkeleton rows={6} />;
  if (!team) {
    return (
      <EmptyState
        icon={UserX}
        title="Team not found"
        description="It may have been deleted. Head back to the list to see what's there."
      />
    );
  }

  const members = staffInTeam(team.name);
  const jobs = rolesInTeam(team.name);

  async function remove() {
    if (!team) return;
    const affected = [
      members.length > 0 &&
        `${members.length} ${members.length === 1 ? "person" : "people"}`,
      jobs.length > 0 && `${jobs.length} ${jobs.length === 1 ? "role" : "roles"}`,
    ]
      .filter(Boolean)
      .join(" and ");
    const confirmed = await confirmAction({
      title: `Delete "${team.name}"?`,
      body: affected
        ? `${affected} will be left without a team. Nobody is removed and no role is deleted.`
        : undefined,
      confirmLabel: "Delete team",
    });
    if (!confirmed) return;
    setDeleting(true);
    const ok = await deleteTeam(team);
    setDeleting(false);
    if (ok) {
      toast.success(`"${team.name}" deleted`);
      router.push("/settings/teams");
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-5">
      <div>
        <SettingsBackLink href="/settings/teams" label="Teams" />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-semibold tracking-tight">{team.name}</h2>
          <button
            type="button"
            onClick={remove}
            disabled={deleting}
            className="ml-auto flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[12px] text-muted-foreground transition-colors hover:border-danger/40 hover:text-[var(--danger-fg)] disabled:pointer-events-none disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete team
          </button>
        </div>
      </div>

      <Card>
        <h3 className="text-sm font-semibold">Name</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          A team name is stored in three places — the team itself, every profile on it and
          every role pointing at it. Renaming here updates all three together.
        </p>
        <div className="mt-3 max-w-sm">
          <Label>Team name</Label>
          <Input
            defaultValue={team.name}
            onBlur={(e) => renameTeam(team, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                e.currentTarget.value = team.name;
                e.currentTarget.blur();
              }
            }}
          />
        </div>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold">
          Roles on this team
          <span className="ml-1.5 text-xs font-normal text-muted-2">{jobs.length}</span>
        </h3>
        {jobs.length === 0 ? (
          <p className="mt-2.5 text-xs text-muted-foreground">
            No roles point at this team yet.
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-1.5">
            {jobs.map((r) => {
              const pageCount = (r.pages ?? []).length;
              return (
                <Link
                  key={r.id}
                  href={`/settings/roles/${r.id}`}
                  className="group flex items-center gap-2.5 rounded-md border border-border-subtle px-2.5 py-2 transition-colors hover:bg-surface-fill"
                >
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                    {r.name}
                  </span>
                  <span
                    className={`flex shrink-0 items-center gap-1 text-[11.5px] ${
                      r.is_admin ? "text-[var(--warning-fg)]" : "text-muted-foreground"
                    }`}
                  >
                    <ShieldCheck className="h-3 w-3" />
                    {r.is_admin ? "Full admin" : `${pageCount} page${pageCount === 1 ? "" : "s"}`}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-2 transition-transform group-hover:translate-x-0.5" />
                </Link>
              );
            })}
          </div>
        )}
      </Card>

      <Card>
        <h3 className="text-sm font-semibold">
          Members
          <span className="ml-1.5 text-xs font-normal text-muted-2">{members.length}</span>
        </h3>
        {members.length === 0 ? (
          <p className="mt-2.5 text-xs text-muted-foreground">Nobody is on this team yet.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-1.5">
            {members.map((p) => (
              <Link
                key={p.id}
                href="/team"
                className="flex items-center gap-2.5 rounded-md border border-border-subtle px-2.5 py-2 transition-colors hover:bg-surface-fill"
              >
                <Avatar name={p.full_name} size="sm" />
                <span className="min-w-0 flex-1 truncate text-[13px]">{p.full_name}</span>
                {p.title && (
                  <span className="truncate text-[11.5px] text-muted-2">{p.title}</span>
                )}
                <span className="shrink-0 rounded-md border border-border-subtle px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  {USER_ROLE_LABELS[p.role]}
                </span>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
