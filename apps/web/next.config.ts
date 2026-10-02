import type { NextConfig } from 'next';

// Where the Express API runs. The browser talks to it through this app's own origin,
// so the dashboard's httpOnly session cookie stays first-party.
const apiUrl = process.env.API_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    // Product photos uploaded from the dashboard live on Cloudinary in production.
    remotePatterns: [{ protocol: 'https', hostname: 'res.cloudinary.com' }],
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
