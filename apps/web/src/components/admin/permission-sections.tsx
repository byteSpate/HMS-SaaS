'use client';
// Permission picker for the role page (T-ACC-05; FR-ACC-008; C00 section 8 catalogue): a summary
// with select all, then one card per module with its own count and select all. Codes are shown
// as they are in the catalogue: they are the administrator's shared vocabulary with the product
// documentation.
import { moduleCodes, moduleOf, type PermissionCode, permissionCodes } from '@hms/contracts';
import { Button, Checkbox } from '@hms/ui';
import { useTranslations } from 'next-intl';

const BY_MODULE = moduleCodes
  .map((module) => ({ module, codes: permissionCodes.filter((code) => moduleOf(code) === module) }))
  .filter((group) => group.codes.length > 0);

export function PermissionSections({
  selected,
  onChange,
}: {
  selected: ReadonlySet<PermissionCode>;
  onChange: (next: Set<PermissionCode>) => void;
}) {
  const t = useTranslations();
  const allSelected = selected.size === permissionCodes.length;

  function setMany(codes: readonly PermissionCode[], on: boolean): void {
    const next = new Set(selected);
    for (const code of codes) {
      if (on) next.add(code);
      else next.delete(code);
    }
    onChange(next);
  }

  function toggle(code: PermissionCode): void {
    setMany([code], !selected.has(code));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-border bg-surface px-4 py-3">
        <p data-testid="permission-summary">
          {t('admin.selectedOfTotal', { selected: selected.size, total: permissionCodes.length })}
        </p>
        <Button variant="ghost" onClick={() => setMany(permissionCodes, !allSelected)}>
          {allSelected ? t('admin.clearAll') : t('admin.selectAll')}
        </Button>
      </div>

      {BY_MODULE.map((group) => {
        const count = group.codes.filter((code) => selected.has(code)).length;
        const full = count === group.codes.length;
        const headingId = `permissions-${group.module}`;
        return (
          <section
            key={group.module}
            aria-labelledby={headingId}
            className="overflow-hidden rounded-panel border border-border bg-surface"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2">
              <h2 id={headingId} className="flex items-center gap-2 font-medium capitalize">
                {group.module}
                <span className="rounded-pill bg-primary-soft px-2 text-sm font-normal text-primary">
                  {count}/{group.codes.length}
                </span>
              </h2>
              <Button
                variant="ghost"
                aria-label={
                  full
                    ? t('admin.clearModule', { module: group.module })
                    : t('admin.selectModule', { module: group.module })
                }
                onClick={() => setMany(group.codes, !full)}
              >
                {full ? t('admin.clearAll') : t('admin.selectAll')}
              </Button>
            </div>
            {/* Each cell draws its top and start border; the grid is pulled 1px to the start so
                the section clips the outer edge, and empty cells at the end stay plain surface. */}
            <div className="-ms-px grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {group.codes.map((code) => (
                <Checkbox
                  key={code}
                  className="border-s border-t border-border px-4 py-3 font-mono text-sm hover:bg-surface-hover"
                  label={code}
                  checked={selected.has(code)}
                  onChange={() => toggle(code)}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
