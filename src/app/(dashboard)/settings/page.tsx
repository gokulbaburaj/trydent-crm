"use client";

import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { useAuth } from "@/lib/useAuth";

export default function SettingsPage() {
  const { profile, isSupabaseConfigured } = useAuth();

  return (
    <div className="flex flex-col gap-5 max-w-xl">
      <Card>
        <h3 className="mb-4 text-sm font-semibold text-muted">Your Profile</h3>
        {profile ? (
          <div className="flex items-center gap-4">
            <Avatar name={profile.full_name} url={profile.avatar_url} size="lg" />
            <div>
              <p className="font-medium">{profile.full_name}</p>
              <p className="text-sm text-muted">{profile.email}</p>
              <Badge tone="green" className="mt-1">{profile.role}</Badge>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted">Not signed in.</p>
        )}
      </Card>

      <Card>
        <h3 className="mb-2 text-sm font-semibold text-muted">Environment</h3>
        <p className="text-sm">
          Supabase connection:{" "}
          {isSupabaseConfigured ? (
            <span className="text-accent">Connected</span>
          ) : (
            <span className="text-warning">Not configured</span>
          )}
        </p>
      </Card>
    </div>
  );
}
