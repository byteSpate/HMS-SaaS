// Hospital logo and name, linking home. Until a hospital uploads its logo (CMS theme), the
// Bytespate mark is the placeholder tenant logo (C-060). The mark carries pure red and green, so
// it stays away from status colors (DESIGN.md, Logo Quarantine Rule). Implements: T-WEB-05.
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Link } from '../i18n/navigation';

export function Logo({
  name,
  inverse = false,
  src,
}: {
  name: string;
  inverse?: boolean;
  src?: string;
}) {
  const t = useTranslations();
  return (
    <Link
      href="/"
      aria-label={t('shell.homeLink', { name })}
      className="flex min-w-0 shrink-0 items-center gap-3 rounded-control"
    >
      <Image
        src={src ?? '/brand/bytespate-mark.png'}
        alt=""
        width={40}
        height={40}
        className="size-10 shrink-0 rounded-control"
        priority
      />
      <span
        className={`truncate font-heading text-lg font-semibold ${inverse ? 'text-on-primary' : 'text-heading'}`}
      >
        {name}
      </span>
    </Link>
  );
}
