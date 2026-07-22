import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

const ALLOWED_ROLES = ["admin", "rep", "contractor"] as const;

/** Confirm the caller is a signed-in admin; returns their user id or an error response. */
async function requireAdmin() {
  const supabase = await createServerClient();
  if (!supabase) {
    return { error: NextResponse.json({ error: "Supabase not configured." }, { status: 500 }) };
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Not signed in." }, { status: 401 }) };
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") {
    return { error: NextResponse.json({ error: "Only admins can manage team members." }, { status: 403 }) };
  }
  return { userId: user.id };
}

/**
 * POST /api/team-users
 * Admin-only: creates a Supabase auth user for a team member (role
 * admin/rep/contractor) and returns the new profile row.
 * Body: { full_name, email, password, role, team?, reports_to? }
 */
export async function POST(req: Request) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !url) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY is not configured on the server." },
      { status: 500 }
    );
  }

  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null);
  const fullName = String(body?.full_name ?? "").trim();
  const email = String(body?.email ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");
  const role = String(body?.role ?? "");
  const team = body?.team ? String(body.team).trim() : null;
  const reportsTo = body?.reports_to ? String(body.reports_to) : null;

  if (!fullName) return NextResponse.json({ error: "Name is required." }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }
  if (!ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) {
    return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  }

  const admin = createServiceClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // The on-signup trigger creates the profile from this metadata (role included).
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role },
  });
  if (createError || !created?.user) {
    const raw = createError?.message ?? "";
    const lower = raw.toLowerCase();
    if (lower.includes("already")) {
      return NextResponse.json({ error: "That email is already in use." }, { status: 400 });
    }
    // The signup trigger casts the role to the user_role enum. If the
    // contractor migration hasn't run, that cast fails with a generic
    // "database error" — point at the real fix instead.
    if (role === "contractor" && (lower.includes("database") || lower.includes("unexpected"))) {
      return NextResponse.json(
        {
          error:
            "The 'contractor' role doesn't exist in the database yet. Run supabase/migrations/2026-07-22b_contractor_role.sql (on its own), then 2026-07-22c_staff_portal.sql, and try again.",
        },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: raw || "Couldn't create user." }, { status: 400 });
  }

  // Fill in team / manager (not part of the signup trigger). Best-effort: the
  // account already exists at this point, so a failure here (e.g. the team
  // hierarchy migration hasn't run) must not fail the whole request.
  let warning: string | null = null;
  if (team || reportsTo) {
    const { error: profileError } = await admin
      .from("profiles")
      .update({ team, reports_to: reportsTo })
      .eq("id", created.user.id);
    if (profileError) {
      warning = `Member created, but team/manager couldn't be saved: ${profileError.message}`;
    }
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("*")
    .eq("id", created.user.id)
    .single();

  return NextResponse.json({ ok: true, profile, warning });
}

/**
 * DELETE /api/team-users
 * Admin-only: removes a team member's auth user with the service role key.
 * The profiles row is deleted automatically (profiles.id references
 * auth.users on delete cascade). Body: { user_id }
 */
export async function DELETE(req: Request) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !url) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY is not configured on the server." },
      { status: 500 }
    );
  }

  // 1. Caller must be a signed-in admin.
  const supabase = await createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured." }, { status: 500 });
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Only admins can remove team members." }, { status: 403 });
  }

  // 2. Validate.
  const body = await req.json().catch(() => null);
  const userId = String(body?.user_id ?? "");
  if (!userId) {
    return NextResponse.json({ error: "Missing user id." }, { status: 400 });
  }
  if (userId === user.id) {
    return NextResponse.json({ error: "You can't remove your own account." }, { status: 400 });
  }

  // 3. Delete the auth user (cascades to the profile row).
  const admin = createServiceClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
