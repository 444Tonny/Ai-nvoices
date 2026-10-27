import { supabaseKey, supabaseUrl } from "@/lib/env";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// /api/mcp et OAuth gèrent leur propre authentification (jetons, PKCE).
const PUBLIC_PATHS = ["/login", "/auth", "/api/mcp", "/api/oauth", "/.well-known"];

/** Chemin interne sûr pour revenir après connexion. */
function safeNext(value: string | null): string | null {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : null;
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    supabaseUrl(),
    supabaseKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));

  if (!user && !isPublic) {
    if (path.startsWith("/api/")) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    // Revenir ensuite à la page demandée (ex. consentement OAuth).
    if (path !== "/") url.searchParams.set("next", path + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  if (user && path === "/login") {
    const next = safeNext(request.nextUrl.searchParams.get("next"));
    const url = request.nextUrl.clone();
    url.search = "";
    if (next) {
      const target = new URL(next, request.url);
      url.pathname = target.pathname;
      url.search = target.search;
    } else {
      url.pathname = "/";
    }
    return NextResponse.redirect(url);
  }

  return response;
}
