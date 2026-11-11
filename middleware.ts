// middleware.ts
// Supabase session refresh and authentication guard for workspace routes.
// Only active when Supabase environment variables are configured.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If Supabase is not configured, allow everything (demo mode)
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // Refresh the session — this is critical for keeping the user signed in
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isWorkspaceRoute = request.nextUrl.pathname.startsWith("/workspace");
  const isApiRoute = request.nextUrl.pathname.startsWith("/api");
  const isLoginRoute = request.nextUrl.pathname === "/login";
  const isAuthCallbackRoute =
    request.nextUrl.pathname === "/auth/callback";

  // Protect workspace and API routes — redirect unauthenticated users to /login
  if (!user && (isWorkspaceRoute || isApiRoute)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  // If user is already authenticated and visits /login, redirect to workspace
  if (user && isLoginRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/workspace/overview";
    return NextResponse.redirect(url);
  }

  // Allow auth callback route through
  if (isAuthCallbackRoute) {
    return supabaseResponse;
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Match all workspace routes, API routes, login, and auth callback
    "/workspace/:path*",
    "/api/:path*",
    "/login",
    "/auth/callback",
  ],
};
