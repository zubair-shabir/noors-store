import type { NextConfig } from 'next';

// Where the Express API runs. The browser talks to it through this app's own origin,
// so the dashboard's httpOnly session cookie stays first-party.
const apiUrl = process.env.API_URL ?? 'http://localhost:4000';

// Browser hardening for every page. No script-src policy: Razorpay's checkout script and the
// inline theme script would need nonces, and these headers cover the common attacks.
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  {
    key: 'Content-Security-Policy',
    value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    // Product photos uploaded from the dashboard live on Cloudinary in production.
    remotePatterns: [{ protocol: 'https', hostname: 'res.cloudinary.com' }],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${apiUrl}/api/:path*` },
      // Admin uploads when Cloudinary isn't configured (local development).
      { source: '/uploads/:path*', destination: `${apiUrl}/uploads/:path*` },
    ];
  },
};

export default nextConfig;
