import { NextResponse, type NextRequest } from 'next/server';

/**
 * Sends visitors without a dashboard session cookie to the sign-in page before any
 * dashboard page renders. The API still checks the session itself on every call.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has('noors_admin')) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = '/admin/login';
  url.search = `?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/admin', '/admin/((?!login).*)'],
};
