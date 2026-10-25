import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { securityHeaders } from '@hms/ui/security';

// Public hospital website (EP-31). Pages are static and read only content data; there are no
// Server Actions and no backend calls in WEB-A (C-063, P-028). The staff app moved under /staff
// (P-043); on the shared host the old staff bookmarks reach this app, so they are redirected
// there (FR-WEB-ROUTE-002). Implements: T-WEB-01, T-WEB-18, P-029.
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/cms/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'Cache-Control', value: 'private, no-store' },
        ],
      },
      {
        source: '/:path*',
        headers: securityHeaders({ development: process.env.NODE_ENV !== 'production' }),
      },
    ];
  },
  async redirects() {
    return [
      { source: '/cms', destination: '/cms/bn', permanent: false },
      ...['/login', '/choose-hospital'].map((path) => ({
        source: path,
        destination: `/staff${path}`,
        permanent: true,
      })),
    ];
  },
};

export default withNextIntl(nextConfig);
