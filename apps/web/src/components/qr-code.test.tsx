// QrCode must paint its own white background and black modules (T-ACC-04): the theme has no
// Tailwind white or black, so colour classes would leave a solid black square.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { QrCode } from './qr-code';

describe('QrCode', () => {
  const markup = renderToStaticMarkup(
    <QrCode value="otpauth://totp/HMS:admin?secret=JBSWY3DPEHPK3PXP" label="Set-up code" />,
  );

  it('draws black modules on a white background without colour classes', () => {
    expect(markup).toMatch(/<rect[^>]*fill="white"/);
    expect(markup).toMatch(/<path[^>]*fill="black"/);
    expect(markup).not.toContain('class=');
  });

  it('has modules to scan and an accessible label', () => {
    expect(markup).toMatch(/<path d="M\d+ \d+h1v1h-1z/);
    expect(markup).toContain('aria-label="Set-up code"');
  });
});
