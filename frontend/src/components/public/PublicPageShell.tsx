import type { ReactNode } from 'react';
import PublicHeader from './PublicHeader';
import PublicFooter from './PublicFooter';
import { useLocale } from '../../hooks/useLocale';
import { DIR, FONT } from '../../lib/i18n';

/** Shared sticky header + footer shell for every public-site page. */
export default function PublicPageShell({
  children,
  beforeHeader,
}: {
  children: ReactNode;
  /** Home announcement bar and similar strips that sit above the sticky header. */
  beforeHeader?: ReactNode;
}) {
  const { locale } = useLocale();
  return (
    <div dir={DIR[locale]} style={{ fontFamily: FONT[locale], background: '#f6f8fb', minHeight: '100vh' }}>
      {beforeHeader}
      <PublicHeader />
      {children}
      <PublicFooter />
    </div>
  );
}
