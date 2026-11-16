import { NextResponse, type NextRequest } from "next/server";

/**
 * Proxy (antes "middleware") — SÓ para /settings. Duas tarefas:
 *  1. CSP com nonce por requisição (sem 'unsafe-inline' para scripts).
 *  2. Verificação OTIMISTA de sessão: só olha se o cookie existe (sem banco, regra do Next).
 *     A verificação de verdade é sempre feita no servidor (DAL, `src/server/auth/dal.ts`, Onda 1):
 *     este redirecionamento é conforto, NUNCA segurança.
 */
const PUBLIC_PATHS = ["/settings/login", "/settings/setup", "/settings/forgot-password", "/settings/reset-password"];
const SESSION_COOKIE_SUFFIX = "ddadmin.session_token";

export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const dev = process.env.NODE_ENV !== "production";

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'${dev ? " 'unsafe-inline'" : ""}`,
    "style-src-attr 'unsafe-inline'", // atributos style="" gerados pelo React/Tailwind
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
  const hasSessionCookie = request.cookies.getAll().some((c) => c.name.endsWith(SESSION_COOKIE_SUFFIX));

  if (!isPublic && !hasSessionCookie) {
    const redirect = NextResponse.redirect(new URL("/settings/login", request.url));
    redirect.headers.set("Cache-Control", "no-store");
    return redirect;
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export const config = {
  matcher: ["/settings/:path*"],
};
