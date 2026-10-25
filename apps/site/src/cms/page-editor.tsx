// Page details and ready-made sections, with keyboard ordering. T-CMS-04, C-087.
'use client';
import { useEffect, useState } from 'react';
import type { Locale } from '@hms/i18n';
import type { CmsSnapshot, Page, Section } from '@hms/contracts';
import { Button, Field, Select, TextInput } from '@hms/ui';
import { ValueEditor } from './value-editor';
import type { FieldPath } from './validation';
import type { CmsMessages } from './messages';

export function PageEditor({
  snapshot,
  locale,
  focusPath,
  templates,
  assets,
  messages: m,
  disabled,
  onChange,
}: {
  snapshot: CmsSnapshot;
  locale: Locale;
  focusPath: FieldPath;
  templates: Section[];
  assets: string[];
  messages: CmsMessages;
  disabled: boolean;
  onChange: (next: CmsSnapshot) => void;
}) {
  const [pageIndex, setPageIndex] = useState(0);
  useEffect(() => {
    if (focusPath[0] === 'pages' && typeof focusPath[1] === 'number') setPageIndex(focusPath[1]);
  }, [focusPath]);
  const [templateType, setTemplateType] = useState(templates[0]?.type ?? 'hero');
  const builtInPaths = new Set(['/', '/about', '/emergency', '/patients-and-visitors', '/portal']);
  const page = snapshot.pages[pageIndex] ?? snapshot.pages[0];
  if (!page) return null;
  function update(next: Page) {
    onChange({
      ...snapshot,
      pages: snapshot.pages.map((old, index) => (index === pageIndex ? next : old)),
    });
  }
  function move(index: number, direction: number) {
    if (!page) return;
    const sections = [...page.sections];
    const target = index + direction;
    const current = sections[index];
    const other = sections[target];
    if (!current || !other) return;
    sections[index] = other;
    sections[target] = current;
    update({ ...page, sections });
  }
  return (
    <div className="space-y-7">
      <Field label={m.selectPage}>
        {(control) => (
          <Select
            {...control}
            disabled={disabled}
            value={String(pageIndex)}
            options={snapshot.pages.map((item, index) => ({
              value: String(index),
              label: `${locale === 'en' ? item.title.en : item.title.bn} (${item.path})`,
            }))}
            onChange={(e) => setPageIndex(Number(e.target.value))}
          />
        )}
      </Field>
      <Button
        variant="secondary"
        disabled={disabled}
        onClick={() => {
          const next = {
            ...structuredClone(page),
            path: `/page-${crypto.randomUUID().slice(0, 8)}`,
            sections: [],
          };
          onChange({ ...snapshot, pages: [...snapshot.pages, next] });
          setPageIndex(snapshot.pages.length);
        }}
      >
        {m.addPage}
      </Button>
      {!builtInPaths.has(page.path) ? (
        <div id={`cms-field-pages-${pageIndex}-path`}>
          <Field label={m.pagePath}>
            {(control) => (
              <TextInput
                {...control}
                disabled={disabled}
                value={page.path}
                onChange={(event) => update({ ...page, path: event.target.value })}
              />
            )}
          </Field>
        </div>
      ) : null}
      <ValueEditor
        name="title"
        path={['pages', pageIndex, 'title']}
        template={page.title}
        value={page.title}
        onChange={(title) => update({ ...page, title: title as Page['title'] })}
        messages={m}
        assets={assets}
        disabled={disabled}
      />
      <details className="border-y border-border py-4">
        <summary className="cursor-pointer font-semibold">{m.seo}</summary>
        <div className="pt-4">
          <ValueEditor
            name="seo"
            path={['pages', pageIndex, 'seo']}
            template={page.seo}
            value={page.seo}
            onChange={(seo) => update({ ...page, seo: seo as Page['seo'] })}
            messages={m}
            assets={assets}
            disabled={disabled}
          />
        </div>
      </details>
      <ol className="space-y-3" aria-label={m.pages}>
        {page.sections.map((section, index) => (
          <li key={section.id} className="rounded-panel border border-border bg-surface">
            <details>
              <summary className="cursor-pointer px-4 py-4 font-semibold">
                {m.section}: {m.sections[section.type]} {section.hidden ? `(${m.hidden})` : ''}
              </summary>
              <div className="border-t border-border p-4">
                <ValueEditor
                  value={section.props}
                  path={['pages', pageIndex, 'sections', index, 'props']}
                  template={templates.find((item) => item.type === section.type)?.props}
                  messages={m}
                  assets={assets}
                  disabled={disabled}
                  onChange={(props) =>
                    update({
                      ...page,
                      sections: page.sections.map((old, i) =>
                        i === index ? ({ ...section, props } as Section) : old,
                      ),
                    })
                  }
                />
              </div>
            </details>
            <div className="flex flex-wrap gap-1 border-t border-border px-3 py-2">
              <Button
                variant="ghost"
                size="md"
                disabled={disabled || index === 0}
                onClick={() => move(index, -1)}
              >
                {m.moveUp}
              </Button>
              <Button
                variant="ghost"
                size="md"
                disabled={disabled || index === page.sections.length - 1}
                onClick={() => move(index, 1)}
              >
                {m.moveDown}
              </Button>
              <Button
                variant="secondary"
                size="md"
                aria-pressed={!section.hidden}
                disabled={disabled}
                onClick={() =>
                  update({
                    ...page,
                    sections: page.sections.map((old, i) =>
                      i === index ? { ...old, hidden: !old.hidden } : old,
                    ),
                  })
                }
              >
                {section.hidden ? m.hidden : m.visible}
              </Button>
              <Button
                variant="ghost"
                size="md"
                disabled={disabled}
                onClick={() => {
                  if (window.confirm(m.removeSectionConfirm))
                    update({ ...page, sections: page.sections.filter((_, i) => i !== index) });
                }}
              >
                {m.remove}
              </Button>
            </div>
          </li>
        ))}
      </ol>
      {page.sections.length === 0 ? <p className="text-text-muted">{m.emptySections}</p> : null}
      <div className="flex flex-wrap items-end gap-3">
        <Field label={m.selectSection} className="min-w-48 flex-1">
          {(control) => (
            <Select
              {...control}
              disabled={disabled}
              value={templateType}
              options={templates.map((section) => ({
                value: section.type,
                label: m.sections[section.type],
              }))}
              onChange={(e) => setTemplateType(e.target.value as Section['type'])}
            />
          )}
        </Field>
        <Button
          variant="secondary"
          disabled={disabled}
          onClick={() => {
            const template = templates.find((item) => item.type === templateType);
            if (template)
              update({
                ...page,
                sections: [
                  ...page.sections,
                  { ...structuredClone(template), id: `section-${crypto.randomUUID()}` },
                ],
              });
          }}
        >
          {m.addSection}
        </Button>
      </div>
    </div>
  );
}
