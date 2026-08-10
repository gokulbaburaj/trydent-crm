"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ShieldCheck, Trash2, UserX } from "lucide-react";
import { toast } from "@/components/Toaster";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { Input, Label } from "@/components/ui/Input";
import { Dropdown } from "@/components/ui/Dropdown";
import { Checkbox } from "@/components/ui/Checkbox";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/Skeletons";
import { RequireAdmin } from "@/components/RequireAdmin";
import { SettingsBackLink } from "@/components/SettingsBackLink";
import { useOrgAdmin } from "@/lib/useOrgAdmin";
import {
  ALWAYS_GRANTED,
  ENFORCED_PAGES,
  GRANTABLE_PAGES,
  PAGE_LABELS,
  PORTAL_PAGE,
} from "@/lib/permissions";
import { USER_ROLE_LABELS } from "@/lib/types";
import { cn } from "@/lib/utils";
import { confirmAction } from "@/components/ui/ConfirmDialog";

export default function RoleDetailPage() {
  return (
    <RequireAdmin>
      <RoleDetailInner />
    </RequireAdmin>
  );
}

function RoleDetailInner() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const {
    loading,
    roles,
    teamNames,
    templates,
    staffWithRole,
    updateRole,
    deleteRole,
  } = useOrgAdmin();
  const [deleting, setDeleting] = useState(false);

  const role = roles.find((r) => r.id === params.id) ?? null;

  if (loading) return <TableSkeleton rows={6} />;
  if (!role) {
    return (
      <EmptyState
        icon={UserX}
        title="Role not found"
        description="It may have been deleted. Head back to the list to see what's there."
      />
    );
  }

  const holders = staffWithRole(role.id);

  async function remove() {
    if (!role) return;
    const confirmed = await confirmAction({
      title: `Delete the "${role.name}" role?`,
      body: "Nothing else is removed — this only takes the job off the list.",
      confirmLabel: "Delete role",
    });
    if (!confirmed) return;
    setDeleting(true);
    const ok = await deleteRole(role.id);
    setDeleting(false);
    if (ok) {
      toast.success(`"${role.name}" deleted`);
      router.push("/settings/roles");
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-5">
      <div>
        <SettingsBackLink href="/settings/roles" label="Company roles" />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-semibold tracking-tight">{role.name}</h2>
          {role.is_admin && (
            <span className="flex items-center gap-1 rounded-md border border-warning/40 bg-warning/10 px-2 py-0.5 text-[11.5px] text-[var(--warning-fg)]">
              <ShieldCheck className="h-3 w-3" /> Full admin
            </span>
          )}
          <button
            type="button"
            onClick={remove}
            disabled={deleting || holders.length > 0}
            title={
              holders.length > 0
                ? "Someone still holds this role. Move them first."
                : undefined
            }
            className="ml-auto flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[12px] text-muted-foreground transition-colors hover:border-danger/40 hover:text-[var(--danger-fg)] disabled:pointer-events-none disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete role
          </button>
        </div>
      </div>

      <Card>
        <h3 className="text-sm font-semibold">Details</h3>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <Label>Role name</Label>
            <Input
              defaultValue={role.name}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== role.name) updateRole(role.id, { name: v });
              }}
            />
          </div>
          <div>
            <Label>Team</Label>
            <Dropdown
              value={role.team ?? ""}
              placeholder="No team"
              options={[
                { value: "", label: "No team" },
                ...teamNames.map((t) => ({ value: t, label: t })),
              ]}
              onChange={(v) => updateRole(role.id, { team: v || null })}
            />
          </div>
          <div>
            <Label>Onboarding checklist</Label>
            <Dropdown
              value={role.template_id ?? ""}
              placeholder="No checklist"
              options={[
                { value: "", label: "No checklist" },
                ...templates.map((t) => ({ value: t.id, label: t.name })),
              ]}
              onChange={(v) => updateRole(role.id, { template_id: v || null })}
            />
          </div>
        </div>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold">Pages</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          What someone in this role sees in the sidebar. Pages marked{" "}
          <span className="text-[var(--warning-fg)]">enforced</span> are also locked in the database —
          granting one hands over the data, not just the menu item.
        </p>

        <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2 sm:grid-cols-3">
          {GRANTABLE_PAGES.map((page) => {
            const locked = ALWAYS_GRANTED.includes(page);
            const on = locked || (role.pages ?? []).includes(page);
            return (
              <Checkbox
                key={page}
                checked={on}
                // Everyone keeps My Work and Settings — without them a person
                // signs in to a dead app and can't even change their password.
                disabled={locked || role.is_admin}
                onChange={(next) =>
                  updateRole(role.id, {
                    pages: next
                      ? [...new Set([...(role.pages ?? []), page])]
                      : (role.pages ?? []).filter((p) => p !== page),
                  })
                }
                label={
                  <span className="flex items-center gap-1 text-[12.5px]">
                    {PAGE_LABELS[page]}
                    {ENFORCED_PAGES.includes(page) && (
                      <span className="text-[9px] uppercase tracking-wide text-[var(--warning-fg)]">
                        enforced
                      </span>
                    )}
                    {page === PORTAL_PAGE && (
                      <span className="text-[9px] uppercase tracking-wide text-muted-2">
                        instead of the app
                      </span>
                    )}
                  </span>
                }
              />
            );
          })}
        </div>

        <div className="mt-4 border-t border-border-subtle pt-3">
          <Checkbox
            checked={role.is_admin}
            onChange={async (next) => {
              // Granting only. Taking admin away needs no ceremony — the
              // dangerous direction is the one that hands out access.
              if (next) {
                const ok = await confirmAction({
                  title: `Give the "${role.name}" role full admin rights?`,
                  body:
                    "Everyone with this role will see what people are paid, and be " +
                    "able to change roles and access — including yours.",
                  confirmLabel: "Grant admin",
                });
                if (!ok) return;
              }
              updateRole(role.id, { is_admin: next });
            }}
            label={
              <span className="text-[12.5px]">
                Full admin rights
                <span className="ml-1.5 text-[11.5px] text-muted-2">
                  every page, plus pay, roles and logins
                </span>
              </span>
            }
          />
        </div>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold">
          People with this role
          <span className="ml-1.5 text-xs font-normal text-muted-2">{holders.length}</span>
        </h3>
        {holders.length === 0 ? (
          <p className="mt-2.5 text-xs text-muted-foreground">
            Nobody holds this role yet. That&apos;s also why it can be deleted — the
            button turns off the moment someone does.
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-1.5">
            {holders.map((p) => (
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
                <span
                  className={cn(
                    "shrink-0 rounded-md border border-border-subtle px-1.5 py-0.5 text-[11px] text-muted-foreground"
                  )}
                >
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
