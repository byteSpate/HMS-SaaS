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
        source: '/:path*',
        headers: securityHeaders({ development: process.env.NODE_ENV !== 'production' }),
      },
    ];
  },
  async redirects() {
    // The hospital choice screen went with one hospital per account (T-ACC-06): its old bookmark
    // opens the staff app, which sends a signed-out visitor to sign in.
    return [
      { source: '/login', destination: '/staff/login', permanent: true },
      { source: '/choose-hospital', destination: '/staff', permanent: true },
    ];
  },
};

export default withNextIntl(nextConfig);
