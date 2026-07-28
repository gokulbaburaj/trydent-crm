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

  // Client portal users get routed here, before any app route renders, using
  // JWT metadata so it costs no database round-trip.
  //
  // Staff are deliberately NOT routed here any more. Which surface a staff
  // member sees now falls out of their role's page grants, and those live in
  // the database — middleware can't read them without a query on every single
  // request. The dashboard layout does it instead, and its `redirectPending`
  // guard shows a loading state rather than painting a page they'll be moved
  // off. Inferring it from employment type (the old `role === 'contract'`
  // check) was wrong: it stranded a contractor who'd been granted the full app
  // on the cut-down portal.
  const meta = user?.user_metadata as { role?: string } | undefined;
  const portalHome = meta?.role === "client" ? "/portal" : null;

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
