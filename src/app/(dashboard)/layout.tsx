"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { useAuth } from "@/lib/useAuth";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/clients": "Clients",
  "/pipeline": "Pipeline",
  "/projects": "Projects",
  "/schedule": "Schedule",
  "/portals": "Client Portals",
  "/team": "Team",
  "/settings": "Settings",
};

function pageTitleFor(pathname: string | null) {
  if (!pathname) return undefined;
  const match = Object.keys(PAGE_TITLES).find(
    (key) => pathname === key || pathname.startsWith(key + "/")
  );
  return match ? PAGE_TITLES[match] : undefined;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { profile, loading, signOut, isSupabaseConfigured } = useAuth();

  useEffect(() => {
    if (loading) return;

    if (!isSupabaseConfigured) return; // allow preview without live backend

    if (!profile) {
      router.replace("/login");
      return;
    }

    if (profile.role === "client" && pathname !== "/portal") {
      router.replace("/portal");
    }
  }, [loading, profile, isSupabaseConfigured, router, pathname]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted">
        Loading...
      </div>
    );
  }

  if (profile?.role === "client") {
    // client-role users get their own minimal shell rendered by /portal itself
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen overflow-x-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar profile={profile} onSignOut={signOut} title={pageTitleFor(pathname)} />
        <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-6">{children}</main>
      </div>
    </div>
  );
}
