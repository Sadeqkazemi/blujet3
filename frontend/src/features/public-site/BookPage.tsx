import { useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useLocale, type StoredLocale } from '../../hooks/useLocale';
import PublicPageShell from '../../components/public/PublicPageShell';
import type { CabinClass } from '../../types/public-site';

/**
 * Legacy `/book/:flightInstanceId` entry — redirects into the design
 * checkout wizard (`/checkout/new`). Kept so saved-flights and old links
 * still work.
 */
const STR: Record<StoredLocale, { loading: string }> = {
  fa: { loading: 'در حال انتقال به تکمیل خرید…' },
  en: { loading: 'Redirecting to checkout…' },
  ar: { loading: 'جارٍ التحويل إلى إتمام الشراء…' },
};

export default function BookPage() {
  const { flightInstanceId } = useParams<{ flightInstanceId: string }>();
  const [params] = useSearchParams();
  const cabin = (params.get('cabin') as CabinClass) ?? 'ECONOMY';
  const { status } = useAuth();
  const { locale } = useLocale();
  const navigate = useNavigate();
  const t = STR[locale];

  useEffect(() => {
    if (!flightInstanceId || status === 'loading') return;
    navigate(
      `/checkout/new?flightInstanceId=${encodeURIComponent(flightInstanceId)}&cabin=${cabin}`,
      { replace: true },
    );
  }, [flightInstanceId, cabin, status, navigate]);

  return (
    <PublicPageShell>
      <p className="p-8 text-sm text-[#6b7b94]">{t.loading}</p>
    </PublicPageShell>
  );
}
