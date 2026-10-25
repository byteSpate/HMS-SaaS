// Published website branding applies to public content, never CMS controls. T-CMS-03, C-087.
import type { Site } from '@hms/contracts';
import type { CSSProperties } from 'react';
export function websiteThemeStyle(site: Site): CSSProperties {
  const color = site.theme.primaryOverride;
  return {
    ...(color
      ? { '--color-primary': color, '--color-primary-strong': color, '--color-focus': color }
      : {}),
    ...(site.theme.font === 'noto'
      ? {
          '--font-heading':
            "'TikTok Sans Variable', 'Noto Sans Bengali Variable', system-ui, sans-serif",
        }
      : {}),
  } as CSSProperties;
}
