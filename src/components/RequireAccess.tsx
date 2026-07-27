"use client";

import { Lock } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { TableSkeleton } from "@/components/ui/Skeletons";
import { useAuth } from "@/lib/useAuth";
import { canAccess, type PageKey } from "@/lib/permissions";

/**
 * Wraps a page whose contents aren't for everyone.
 *
 * This is a courtesy, not a lock. Someone who types the URL gets this screen
 * instead of a half-broken page, but the actual protection is the RLS policy on
 * the underlying tables — without that, a determined user could still read the
 * data through the API. Any page wrapped here should have a matching policy.
 */
export function RequireAccess({
  page,
  children,
}: {
  page: PageKey;
  children: React.ReactNode;
}) {
  const { profile, access, loading } = useAuth();

  // Don't flash the locked state while the profile is still resolving.
  if (loading || !profile) return <TableSkeleton rows={5} />;

  if (!canAccess(access, page)) {
    return (
      <EmptyState
        icon={Lock}
        title="Not available for your role"
        description="Ask an admin if you need access to this area."
      />
    );
  }

  return <>{children}</>;
}
