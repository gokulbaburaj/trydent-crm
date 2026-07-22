import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  // If Supabase isn't configured yet, skip session refresh entirely.
  if (!url || !anonKey) {
    return response;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = path.startsWith("/login") || path.startsWith("/api");

  const go = (to: string) => {
    const redirect = NextResponse.redirect(new URL(to, request.url));
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c.name, c.value));
    return redirect;
  };

  // Signed out → straight to login (server-side, so the dashboard never flashes).
  if (!user && !isPublic) {
    return go("/login");
  }

  // Portal users get sent to their own home before any app route renders. Read
  // from the JWT metadata so this costs no database round-trip; the dashboard
  // layout still enforces it authoritatively if the metadata is stale/missing.
  const metaRole = (user?.user_metadata as { role?: string } | undefined)?.role;
  const portalHome =
    metaRole === "client" ? "/portal" : metaRole === "contractor" ? "/staff-portal" : null;

  // Signed in → skip the login page, landing on the right home for the role.
  if (user && path.startsWith("/login")) {
    return go(portalHome ?? "/my-work");
  }

  if (user && portalHome && !path.startsWith(portalHome) && !path.startsWith("/api")) {
    return go(portalHome);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
