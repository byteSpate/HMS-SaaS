// Brand mark with a name. Used for both brand slots (ADR-022 section 12): the tenant's logo and
// name inside the shell, and the product on the signed-out screens. Until a hospital exists the
// Bytespate logo is the placeholder tenant logo. The mark carries pure red and green, so it stays
// away from status badges (DESIGN.md, Logo Quarantine Rule). The mark is imported, not given as
// a "/brand/..." string, so Next adds the /staff base path to its URL (P-043).
// Implements: T-UI-02, T-WEB-18.
import Image from 'next/image';
import mark from '../../public/brand/bytespate-mark.png';

export function Brand({ name }: { name: string }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <Image
        src={mark}
        alt=""
        width={32}
        height={32}
        className="shrink-0 rounded-control"
        priority
      />
      {/* data-brand-name: the shell hides the name where only the logo fits. */}
      <span data-brand-name="" className="truncate font-heading font-semibold text-heading">
        {name}
      </span>
    </span>
  );
}
