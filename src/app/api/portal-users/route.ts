import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { isValidPortalUsername, portalEmail } from "@/lib/portal";

/**
 * POST /api/portal-users
 * Admin-only: creates a Supabase auth user for a client portal
 * (role=client, linked to the client record) and stores the username.
 * Body: { username, password, client_id, portal_id, full_name }
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
    return NextResponse.json({ error: "Only admins can create portal logins." }, { status: 403 });
  }

  // 2. Validate input.
  const body = await req.json().catch(() => null);
  const username = String(body?.username ?? "").trim().toLowerCase();
  const password = String(body?.password ?? "");
  const clientId = String(body?.client_id ?? "");
  const portalId = String(body?.portal_id ?? "");
  const fullName = String(body?.full_name ?? "").trim() || username;

  if (!isValidPortalUsername(username)) {
    return NextResponse.json(
      { error: "Username must be 3–30 characters: letters, numbers, dots, dashes." },
      { status: 400 }
    );
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 }
    );
  }
  if (!clientId || !portalId) {
    return NextResponse.json({ error: "Missing client or portal id." }, { status: 400 });
  }

  // 3. Create the auth user with the service role key.
  const admin = createServiceClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const email = portalEmail(username);
  const metadata = { full_name: fullName, role: "client", client_id: clientId };

  const { error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: metadata,
  });

  let reset = false;
  if (createError) {
    const alreadyExists =
      createError.message.toLowerCase().includes("already") ||
      createError.status === 422;
    if (!alreadyExists) {
      return NextResponse.json({ error: createError.message }, { status: 400 });
    }
    // The login already exists — reset its password instead so credentials
    // can always be regenerated from the Portals tab.
    const { data: list, error: listError } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    const existing = list?.users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );
    if (listError || !existing) {
      return NextResponse.json(
        { error: "That username exists but the account could not be found to reset." },
        { status: 400 }
      );
    }
    const { error: updateError } = await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }
    // Make sure the profile is linked to the right client even if the
    // signup trigger predates client_id support.
    await admin
      .from("profiles")
      .update({ role: "client", client_id: clientId })
      .eq("id", existing.id);
    reset = true;
  }

  // 4. Remember the credentials on the portal record so admins can retrieve
  //    them later from the Portals page (deliberate plaintext tradeoff).
  await admin
    .from("client_portals")
    .update({ portal_username: username, portal_password: password })
    .eq("id", portalId);

  return NextResponse.json({ ok: true, email, username, reset });
}
