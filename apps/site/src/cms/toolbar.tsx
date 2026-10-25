// Demo commands clearly describe their browser-only effect. T-CMS-DEMO-01, C-092.
'use client';
import { Button } from '@hms/ui';
import type { Locale } from '@hms/i18n';
import type { CmsMessages } from './messages';
import type { DemoEditor } from './use-demo-editor';
export function DemoToolbar({
  editor: e,
  messages: m,
  locale,
}: {
  editor: DemoEditor;
  messages: CmsMessages;
  locale: Locale;
}) {
  let status: string = m.draft;
  if (e.dirty) status = m.unsaved;
  else if (e.state.draft.revision === e.state.draft.publishedRevision) status = m.live;
  const saved = e.state.draft.revision > 0;
  function openPreview(mode: string) {
    window.open(
      `/cms/${locale === 'en' ? 'en' : 'bn'}/preview?mode=${mode}`,
      '_blank',
      'noopener,noreferrer',
    );
  }
  return (
    <div className="sticky top-14 z-20 flex flex-wrap items-center justify-between gap-4 border-y border-border bg-bg py-4">
      <div>
        <p className="font-semibold">{status}</p>
        <p className="mt-1 text-sm text-text-muted">
          {m.revision.replace('{revision}', String(e.state.draft.revision))}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            if (!e.dirty || window.confirm(m.reloadConfirm)) e.reload();
          }}
        >
          {m.reload}
        </Button>
        <Button
          variant="secondary"
          disabled={e.dirty || !saved}
          onClick={() => openPreview('draft')}
        >
          {m.preview}
        </Button>
        <Button
          variant="secondary"
          disabled={!e.state.publishedId}
          onClick={() => openPreview('published')}
        >
          {m.viewPublished}
        </Button>
        <Button variant="secondary" disabled={!e.dirty || !e.parsed.success} onClick={e.save}>
          {m.save}
        </Button>
        <Button
          disabled={e.dirty || !saved || e.state.draft.publishedRevision === e.state.draft.revision}
          onClick={() => {
            if (window.confirm(m.publishConfirm)) e.publish();
          }}
        >
          {m.publish}
        </Button>
      </div>
    </div>
  );
}
