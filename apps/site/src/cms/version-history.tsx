// Demo publications are snapshots; restoration creates a new draft. T-CMS-DEMO-01, C-092.
'use client';
import { formatDateTime, type Locale } from '@hms/i18n';
import { Button } from '@hms/ui';
import type { CmsMessages } from './messages';
import type { DemoEditor } from './use-demo-editor';
export function VersionHistory({
  editor: e,
  messages: m,
  locale,
}: {
  editor: DemoEditor;
  messages: CmsMessages;
  locale: Locale;
}) {
  if (e.state.versions.length === 0) return <p>{m.noHistory}</p>;
  return (
    <>
      <p className="text-sm text-text-muted">{m.retention}</p>
      <ol className="divide-y divide-border">
        {e.state.versions.map((version) => (
          <li key={version.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
            <div>
              <p className="font-semibold">
                {m.revision.replace('{revision}', String(version.revision))}
              </p>
              <p className="text-sm text-text-muted">
                {formatDateTime(version.publishedAt, locale)}
              </p>
            </div>
            <Button
              variant="secondary"
              disabled={e.dirty}
              onClick={() => {
                if (window.confirm(m.restoreConfirm)) e.restore(version.id);
              }}
            >
              {m.restore}
            </Button>
          </li>
        ))}
      </ol>
    </>
  );
}
