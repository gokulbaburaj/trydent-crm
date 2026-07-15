"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { TabBar } from "@/components/TabBar";
import { Toaster } from "@/components/Toaster";
import { CommandMenu } from "@/components/CommandMenu";
import { TabsProvider } from "@/lib/tabs";
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
  const [mobileNav, setMobileNav] = useState(false);

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

  // While checking the session — or when signed out and about to redirect —
  // never render the dashboard shell (prevents the dashboard-then-login flash).
  if (loading || (isSupabaseConfigured && !profile)) {
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
    <TabsProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar />

        {/* Mobile slide-in navigation */}
        {mobileNav && (
          <div className="fixed inset-0 z-[120] md:hidden">
            <div
              className="animate-fade absolute inset-0 bg-black/60"
              onClick={() => setMobileNav(false)}
            />
            <div className="animate-page absolute left-0 top-0 h-full w-[250px] border-r border-border bg-background">
              <Sidebar mobile onNavigate={() => setMobileNav(false)} />
            </div>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <TabBar />
          <div className="min-h-0 min-w-0 flex-1 px-2 pb-2 md:pl-0">
            <div className="flex h-full min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-panel">
              <Topbar
                profile={profile}
                onSignOut={signOut}
                title={pageTitleFor(pathname)}
                onMenuClick={() => setMobileNav(true)}
              />
              <main
                key={pathname}
                className="animate-page min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6"
              >
                {children}
              </main>
            </div>
          </div>
        </div>

        <Toaster />
        <CommandMenu />
      </div>
    </TabsProvider>
  );
}
