import { useEffect, useState } from 'react';
import {
  connectFinancialIntegration,
  disconnectFinancialIntegration,
  fetchFinancialIntegrations,
  syncFinancialIntegration,
} from '../../api/finance-manager';
import type {
  FinancialIntegration,
  FinancialIntegrationsResult,
  FinancialProvider,
} from '../../types/finance-manager';
import { formatJalaliDateTime } from '../../lib/jalali';
import { faDigits } from '../../lib/fa-format';
import { ApiRequestError } from '../../api/envelope';

const PROVIDER_STYLE: Record<FinancialProvider, { short: string; className: string }> = {
  HOLO: { short: 'هل', className: 'bg-[#f59e0b1f] text-[#f59e0b]' },
  SEPIDAR: { short: 'سپ', className: 'bg-[#4f7ff024] text-[#79a3ff]' },
  HESABFA: { short: 'حـف', className: 'bg-[#10b98120] text-[#34d399]' },
  RAHKARAN: { short: 'را', className: 'bg-[#8b5cf624] text-[#a78bfa]' },
  PARMIS: { short: 'پا', className: 'bg-[#ef444424] text-[#f87171]' },
};

function messageOf(error: unknown) {
  return error instanceof ApiRequestError ? error.message : 'عملیات ناموفق بود؛ دوباره تلاش کنید.';
}

function IntegrationCard({
  integration,
  keyValue,
  busy,
  onKey,
  onConnect,
  onSync,
  onDisconnect,
}: {
  integration: FinancialIntegration;
  keyValue: string;
  busy: string | null;
  onKey: (value: string) => void;
  onConnect: () => void;
  onSync: () => void;
  onDisconnect: () => void;
}) {
  const style = PROVIDER_STYLE[integration.provider];
  return (
    <article className="rounded-[15px] border border-[#222e43] bg-[#141d2e] p-4" data-testid={`integration-${integration.provider}`}>
      <div className="mb-3 flex items-start gap-3">
        <span className={`flex h-10 w-10 flex-none items-center justify-center rounded-[11px] text-xs font-black ${style.className}`}>{style.short}</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-extrabold text-white">{integration.nameFa}</h2>
          <p className="mt-1 text-[10px] text-[#6b7b94]">{integration.descriptionFa}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[9px] font-bold ${integration.connected ? 'bg-[#10b9811f] text-[#34d399]' : 'bg-[#1b2740] text-[#7890b3]'}`}>
          {integration.connected ? 'متصل' : 'متصل نیست'}
        </span>
      </div>

      {integration.connected ? (
        <div className="mb-3 flex min-h-9 items-center justify-between gap-2 rounded-[9px] border border-[#2b3852] bg-[#18223a] px-3 text-[10px] text-[#9fb0c7]">
          <span className="font-num" dir="ltr">{integration.maskedKey ?? '••••••••'}</span>
          <span>{integration.lastSyncedAt ? `آخرین همگام‌سازی: ${formatJalaliDateTime(integration.lastSyncedAt)}` : 'هنوز همگام‌سازی نشده'}</span>
        </div>
      ) : (
        <input
          type="password"
          autoComplete="new-password"
          value={keyValue}
          onChange={(event) => onKey(event.target.value)}
          placeholder="کلید API اتصال را وارد کنید"
          className="mb-3 w-full rounded-[9px] border border-[#2b3852] bg-[#18223a] px-3 py-2.5 text-[10px] text-white outline-none focus:border-[#4f7ff0]"
        />
      )}

      {integration.connected ? (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={Boolean(busy)} onClick={onSync} className="rounded-[9px] bg-[#4f7ff0] px-3 py-2.5 text-[11px] font-extrabold text-white disabled:opacity-50">{busy === 'sync' ? 'در حال همگام‌سازی…' : 'همگام‌سازی'}</button>
          <button type="button" disabled={Boolean(busy)} onClick={onDisconnect} className="rounded-[9px] border border-[#f8717155] bg-[#f8717110] px-3 py-2.5 text-[11px] font-extrabold text-[#f87171] disabled:opacity-50">{busy === 'disconnect' ? 'در حال قطع…' : 'قطع اتصال'}</button>
        </div>
      ) : (
        <button type="button" disabled={Boolean(busy) || keyValue.trim().length < 8} onClick={onConnect} className="w-full rounded-[9px] bg-[#4f7ff0] px-3 py-2.5 text-[11px] font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-45">{busy === 'connect' ? 'در حال اعتبارسنجی…' : 'اتصال'}</button>
      )}
      {!integration.configured && <p className="mt-2 text-[9px] text-[#f59e0b]">پیکربندی سرور این ارائه‌دهنده هنوز تکمیل نشده است.</p>}
    </article>
  );
}

export default function FinancialIntegrationsPage() {
  const [data, setData] = useState<FinancialIntegrationsResult | null>(null);
  const [keys, setKeys] = useState<Partial<Record<FinancialProvider, string>>>({});
  const [busy, setBusy] = useState<{ provider: FinancialProvider; action: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setError(null);
    fetchFinancialIntegrations().then((result) => active && setData(result)).catch((cause) => active && setError(messageOf(cause)));
    return () => { active = false; };
  }, [reload]);

  async function mutate(provider: FinancialProvider, action: 'connect' | 'sync' | 'disconnect') {
    setBusy({ provider, action });
    setError(null);
    setNotice(null);
    try {
      const next = action === 'connect'
        ? await connectFinancialIntegration(provider, keys[provider]?.trim() ?? '')
        : action === 'sync'
          ? await syncFinancialIntegration(provider)
          : await disconnectFinancialIntegration(provider);
      setData(next);
      setKeys((current) => ({ ...current, [provider]: '' }));
      setNotice(action === 'connect' ? 'اتصال با موفقیت اعتبارسنجی و ثبت شد.' : action === 'sync' ? 'همگام‌سازی واقعی با موفقیت انجام شد.' : 'اتصال و اعتبارنامه حذف شد.');
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div dir="rtl" className="min-h-full bg-[#0f1623] px-6 py-5 text-[#e7ecf3] lg:px-8" data-testid="financial-integrations-page">
      <header className="mb-7 text-right">
        <h1 className="text-2xl font-black text-white">اتصال نرم‌افزارهای مالی</h1>
        <p className="mt-1 text-[11px] text-[#6b7b94]">اتصال حساب‌ها به نرم‌افزارهای حسابداری و ERP برای همگام‌سازی خودکار اسناد مالی</p>
      </header>

      {notice && <p aria-live="polite" className="mb-4 rounded-xl border border-[#34d39933] bg-[#10b98118] p-3 text-xs font-bold text-[#34d399]">{notice}</p>}
      {error && <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-[#f8717133] bg-[#f8717118] p-3 text-xs font-bold text-[#f87171]"><span>{error}</span><button type="button" onClick={() => setReload((value) => value + 1)} className="rounded-lg border border-current px-3 py-1.5">تلاش دوباره</button></div>}

      <section className="mb-4 flex flex-wrap items-center gap-4 rounded-[15px] border border-[#30405f] bg-[#1b2945] p-5">
        <span className="flex h-12 w-12 flex-none items-center justify-center rounded-[12px] bg-[#34528b] text-[#79a3ff]" aria-hidden="true">↔</span>
        <div className="flex-1"><h2 className="text-base font-extrabold text-white">اتصال نرم‌افزارهای مالی</h2><p className="mt-1 text-[10px] text-[#9fb0c7]">پنل را به نرم‌افزارهای حسابداری و ERP متصل کنید تا اطلاعات فروش، اسناد و تراز حساب‌ها به‌صورت خودکار همگام شود.</p></div>
        <span className="rounded-full bg-[#10b9811f] px-3 py-2 text-[11px] font-extrabold text-[#34d399]">{faDigits(data?.connectedCount ?? 0)} سرویس متصل</span>
      </section>

      {!data ? (
        <div className="rounded-[15px] border border-[#222e43] bg-[#141d2e] p-12 text-center text-xs text-[#6b7b94]">در حال دریافت وضعیت اتصال‌ها…</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {data.providers.map((integration) => (
            <IntegrationCard
              key={integration.provider}
              integration={integration}
              keyValue={keys[integration.provider] ?? ''}
              busy={busy?.provider === integration.provider ? busy.action : null}
              onKey={(value) => setKeys((current) => ({ ...current, [integration.provider]: value }))}
              onConnect={() => void mutate(integration.provider, 'connect')}
              onSync={() => void mutate(integration.provider, 'sync')}
              onDisconnect={() => {
                if (window.confirm(`اتصال ${integration.nameFa} قطع شود؟`)) void mutate(integration.provider, 'disconnect');
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
