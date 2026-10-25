// Accessible brand colors for the light website themes. T-CMS-03, FR-CMS-013, C-087.
const BACKGROUNDS = ['ffffff', 'f9fbfb', 'f0fdfa', 'f1f3f3'];
function luminance(hex: string): number {
  const channels = [0, 2, 4].map((offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return (channels[0] ?? 0) * 0.2126 + (channels[1] ?? 0) * 0.7152 + (channels[2] ?? 0) * 0.0722;
}
export function isAccessibleWebsiteColor(value: string): boolean {
  if (!/^#[0-9a-f]{6}$/i.test(value)) return false;
  const foreground = luminance(value.slice(1));
  return BACKGROUNDS.every(
    (background) => (luminance(background) + 0.05) / (foreground + 0.05) >= 4.5,
  );
}
