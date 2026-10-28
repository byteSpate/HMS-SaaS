'use client';
// Draws a text (the MFA key URI, T-ACC-04) as a QR code. qrcode-generator only computes the
// module grid; React draws it as one SVG path, so no generated markup is injected into the page.
// Always black on white with a quiet zone, whatever the theme, so phone cameras can read it.
import qrcode from 'qrcode-generator';
import { useMemo } from 'react';

const QUIET_ZONE = 4;

function modulePath(value: string): { size: number; path: string } {
  const qr = qrcode(0, 'M');
  qr.addData(value);
  qr.make();
  const count = qr.getModuleCount();
  let path = '';
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (qr.isDark(row, col)) path += `M${col + QUIET_ZONE} ${row + QUIET_ZONE}h1v1h-1z`;
    }
  }
  return { size: count + QUIET_ZONE * 2, path };
}

export function QrCode({
  value,
  label,
  pixels = 200,
}: {
  value: string;
  label: string;
  pixels?: number;
}) {
  const { size, path } = useMemo(() => modulePath(value), [value]);
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${size} ${size}`}
      width={pixels}
      height={pixels}
      shapeRendering="crispEdges"
    >
      <rect width={size} height={size} className="fill-white" />
      <path d={path} className="fill-black" />
    </svg>
  );
}
