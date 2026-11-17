import { THEME_INIT_SCRIPT } from '@hms/ui';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Hospital ERP',
};

// Bangla first (C-052). The client provider updates `lang` when the language changes
// (FR-I18N-001), so the attribute is allowed to differ from the server-rendered value. The head
// script applies a stored dark theme before the first paint (C-055); the CSP allows inline
// scripts (packages/ui/src/security/headers.ts).
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="bn-BD" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
