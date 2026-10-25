// Stable field addresses and localized correction guidance. T-CMS-DEMO-01, NFR-ACC-001.
import type { CmsMessages } from './messages';
export type FieldPath = (string | number)[];
export function cmsFieldId(path: FieldPath): string {
  return `cms-field-${path.map(String).join('-')}`;
}
export function validationReason(
  issue: { path: PropertyKey[]; code: string; message: string },
  m: CmsMessages,
): string {
  if (issue.path.includes('primaryOverride')) return m.validationColor;
  if (issue.path.includes('enabled')) return m.validationDemoNotice;
  if (issue.path.includes('href') || issue.path.includes('url')) return m.validationLink;
  if (issue.path.includes('email')) return m.validationEmail;
  if (issue.path.includes('path') || issue.message.includes('page paths')) return m.validationPath;
  if (issue.code === 'invalid_value') return m.validationChoice;
  if (issue.code === 'too_small' && (issue.path.at(-1) === 'bn' || issue.path.at(-1) === 'en'))
    return m.validationTranslation;
  return m.validationField;
}
export function focusCmsField(path: FieldPath): void {
  // React may first mount another area/page; wait a bounded number of paint frames for its field.
  let attempts = 0;
  function locate() {
    const target = document.getElementById(cmsFieldId(path));
    if (!target && attempts++ < 5) {
      requestAnimationFrame(locate);
      return;
    }
    if (!target) return;
    let parent: HTMLElement | null = target.parentElement;
    while (parent) {
      if (parent instanceof HTMLDetailsElement) parent.open = true;
      parent = parent.parentElement;
    }
    const control = target.querySelector<HTMLElement>('input,textarea,select,button');
    if (control) control.focus();
    target.scrollIntoView({ block: 'center' });
  }
  requestAnimationFrame(locate);
}
