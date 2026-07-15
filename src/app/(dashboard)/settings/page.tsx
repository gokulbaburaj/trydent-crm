"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/useAuth";
import { ACCENT_PRESETS, useAccent } from "@/lib/theme";

export default function SettingsPage() {
  const { profile, isSupabaseConfigured } = useAuth();
  const { accent, setAccent } = useAccent();
  const [customHex, setCustomHex] = useState("");

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
        <h3 className="mb-1 text-sm font-semibold text-muted">Theme</h3>
        <p className="mb-4 text-xs text-muted">
          Accent color used for buttons, selection, focus states, and highlights across the app.
        </p>
        <div className="flex flex-wrap gap-2.5">
          {ACCENT_PRESETS.map((p) => {
            const active = p.accent.toLowerCase() === accent.toLowerCase();
            return (
              <button
                key={p.accent}
                title={p.name}
                onClick={() => setAccent(p.accent)}
                className={`flex h-9 w-9 items-center justify-center rounded-full transition-transform hover:scale-110 ${
                  active ? "ring-2 ring-white/60 ring-offset-2 ring-offset-surface" : ""
                }`}
                style={{ background: p.accent }}
              >
                {active && <Check className="h-4 w-4" style={{ color: p.foreground }} />}
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex items-center gap-2">
          <Input
            placeholder="#5e6ad2 — custom hex"
            value={customHex}
            onChange={(e) => setCustomHex(e.target.value)}
            className="max-w-[180px]"
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={!/^#[0-9a-fA-F]{6}$/.test(customHex)}
            onClick={() => setAccent(customHex)}
          >
            Apply
          </Button>
          <span
            className="ml-1 h-5 w-5 rounded-full border border-border"
            style={{ background: /^#[0-9a-fA-F]{6}$/.test(customHex) ? customHex : accent }}
          />
        </div>
      </Card>

      <Card>
        <h3 className="mb-2 text-sm font-semibold text-muted">Environment</h3>
        <p className="text-sm">
          Supabase connection:{" "}
          {isSupabaseConfigured ? (
            <span className="text-success">Connected</span>
          ) : (
            <span className="text-warning">Not configured</span>
          )}
        </p>
      </Card>
    </div>
  );
}
