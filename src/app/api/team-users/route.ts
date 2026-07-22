import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

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
