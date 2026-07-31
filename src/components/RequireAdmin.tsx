"use client";

import { Lock } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/Skeletons";
import { useAuth } from "@/lib/useAuth";
import { isAdmin } from "@/lib/permissions";

/**
 * Wraps a page only admins should reach.
 *
 * Distinct from RequireAccess, which asks whether a role has been granted a
 * page. Roles and teams are the thing that *hands out* those grants, so
 * gating them on a grant would be circular — anyone able to reach the page
 * could give themselves everything.
 *
 * Like RequireAccess this is a courtesy, not a lock: `roles` carries an
 * `is_admin`-only write policy and `teams` a `current_can('team')` one, which
 * is what actually stops the write.
 */
export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { profile, access, loading } = useAuth();

  if (loading || !profile) return <TableSkeleton rows={5} />;

  if (!isAdmin(access)) {
    return (
      <EmptyState
        icon={Lock}
        title="Admins only"
        description="Roles and teams decide what everyone else can reach, so only admins can change them."
      />
    );
  }

  return <>{children}</>;
}
