// Actionable validation summary navigates to fields, including closed sections and other areas.
// Implements: T-CMS-DEMO-01, NFR-ACC-001.
'use client';
import { Button } from '@hms/ui';
import { formatNumber, type Locale } from '@hms/i18n';
import type { CmsMessages } from './messages';
import type { DemoEditor } from './use-demo-editor';
import { validationReason, type FieldPath } from './validation';
function pathLabel(path: PropertyKey[], m: CmsMessages, locale: Locale) {
  return path
    .map((part) => {
      if (typeof part === 'number') return formatNumber(String(part + 1), locale);
      if (part === 'site') return m.title;
      if (part === 'pages') return m.pages;
      return m.fields[String(part) as keyof typeof m.fields] ?? String(part);
    })
    .join(' / ');
}
export function Validation({
  editor: e,
  messages: m,
  onField,
  locale,
}: {
  editor: DemoEditor;
  messages: CmsMessages;
  onField: (path: FieldPath) => void;
  locale: Locale;
}) {
  if (e.parsed.success) return null;
  return (
    <div role="alert" className="space-y-2">
      <p className="font-semibold text-danger">{m.invalid}</p>
      <ul className="space-y-2">
        {e.parsed.error.issues.slice(0, 10).map((issue, index) => (
          <li key={index} className="space-y-1">
            <Button
              variant="ghost"
              className="h-auto justify-start whitespace-normal px-0 text-start underline"
              onClick={() =>
                onField(
                  issue.path.filter((part): part is string | number => typeof part !== 'symbol'),
                )
              }
            >
              {pathLabel(issue.path, m, locale)}
            </Button>
            <p className="text-sm text-danger">{validationReason(issue, m)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
