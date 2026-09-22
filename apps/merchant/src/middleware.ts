import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Refreshes the Supabase session on every request and guards the app routes.
 *
 * Server Components cannot write cookies, so without this a refreshed token
 * would be dropped and the user silently logged out mid-session. Middleware is
 * the one place that can both read the request cookies and write them back.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // getUser() revalidates the token against Supabase. getSession() would just
  // decode whatever cookie was sent, which a client can forge.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // The site is no longer private end to end: the landing page, the legal
  // pages and the login form are public, everything else is not. Written as an
  // allowlist rather than a list of guarded prefixes, so a route added later
  // is private by default.
  const path = request.nextUrl.pathname
  // Two front doors on purpose: merchants sign in at /login, operators at
  // /admin/login. Same accounts and the same database checks behind them --
  // the separation is so a merchant never lands on an operator screen and a
  // shared laptop does not offer the admin area to whoever opens it.
  const isAuthRoute = path === '/login' || path === '/admin/login'
  const isPublic =
    isAuthRoute ||
    path === '/' ||
    path.startsWith('/privacy') ||
    path.startsWith('/terms')

  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = path.startsWith('/admin') ? '/admin/login' : '/login'
    return NextResponse.redirect(url)
  }

  // A signed-in account landing on /login goes to the dashboard; the landing
  // page stays reachable for everyone, because a merchant may well want to
  // read it or send it to someone.
  if (user && isAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = path === '/admin/login' ? '/admin/venues' : '/drops'
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg)$).*)'],
}
