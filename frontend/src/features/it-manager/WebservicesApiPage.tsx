import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  decideItWebserviceRequest,
  fetchItWebservices,
  issueItApiClient,
  testItApiAvailability,
  updateItApiClient,
} from '../../api/it-manager';
import Modal from '../../components/Modal';
import JalaliDatePicker from '../../components/JalaliDatePicker';
import { useStepUp } from '../../hooks/useStepUp';
import { faDigits } from '../../lib/fa-format';
import { formatJalaliDateTime } from '../../lib/jalali';
import type {
  IssuedItApiKey,
  ItApiCapability,
  ItApiClientRow,
  ItApiEnvironment,
  ItApiFlightDomain,
  ItApiScope,
  ItAvailabilityTestResult,
  ItWebservicesOverview,
  ItWebserviceRequestRow,
} from '../../types/it-manager';

type Tab = 'requests' | 'clients' | 'events';

const SCOPE_LABEL: Record<ItApiScope, string> = {
  FULL: 'دسترسی کامل',
  SEARCH_BOOK: 'جستجو و رزرو',
  SEARCH_ONLY: 'فقط جستجو',
};

const CAPABILITY_LABEL: Record<ItApiCapability, string> = {
  RESERVATION: 'رزرو پرواز',
  TICKETING: 'صدور بلیط',
  PRICING: 'نرخ‌گذاری',
  FLIGHT_INFO: 'اطلاعات پرواز',
  REFUND: 'استرداد بلیط',
  CHECK_IN: 'چک‌این آنلاین',
  AVAILABILITY: 'استعلام ظرفیت',
};

const ALL_CAPABILITIES = Object.keys(CAPABILITY_LABEL) as ItApiCapability[];

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'خطایی رخ داد. دوباره تلاش کنید.';
}

function money(value: string): string {
  try {
    return BigInt(value).toLocaleString('fa-IR');
  } catch {
    return faDigits(value);
  }
}

function StatusBadge({ status }: { status: string }) {
  const look =
    status === 'ACTIVE' || status === 'APPROVED'
      ? 'bg-emerald-400/10 text-emerald-300'
      : status === 'PENDING'
        ? 'bg-amber-400/10 text-amber-300'
        : status === 'SUSPENDED'
          ? 'bg-orange-400/10 text-orange-300'
          : 'bg-rose-400/10 text-rose-300';
  const label: Record<string, string> = {
    ACTIVE: 'فعال',
    APPROVED: 'تأییدشده',
    PENDING: 'در انتظار',
    SUSPENDED: 'معلق',
    REJECTED: 'ردشده',
    REVOKED: 'لغوشده',
  };
  return (
    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${look}`}>
      {label[status] ?? status}
    </span>
  );
}

export default function WebservicesApiPage() {
  const [data, setData] = useState<ItWebservicesOverview | null>(null);
  const [tab, setTab] = useState<Tab>('requests');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [agencyId, setAgencyId] = useState('');
  const [scope, setScope] = useState<ItApiScope>('SEARCH_ONLY');
  const [query, setQuery] = useState('');
  const [issuedKey, setIssuedKey] = useState<IssuedItApiKey | null>(null);
  const [settingsClient, setSettingsClient] = useState<ItApiClientRow | null>(
    null,
  );
  const stepUp = useStepUp('API_KEY_ROTATE');

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await fetchItWebservices());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const clients = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('fa');
    if (!normalized) return data?.clients ?? [];
    return (data?.clients ?? []).filter(
      (client) =>
        client.agency.toLocaleLowerCase('fa').includes(normalized) ||
        client.keyHint.toLocaleLowerCase('en').includes(normalized),
    );
  }, [data?.clients, query]);

  async function decide(request: ItWebserviceRequestRow, approve: boolean) {
    setBusyId(request.id);
    setError(null);
    try {
      const fields = approve ? await stepUp.confirm() : {};
      const result = await decideItWebserviceRequest(request.id, {
        approve,
        ...fields,
      });
      if (approve && 'apiKey' in result && result.apiKey?.rawKey)
        setIssuedKey(result.apiKey);
      setNotice(
        approve ? 'درخواست تأیید و کلید API صادر شد.' : 'درخواست رد شد.',
      );
      await load();
    } catch (err) {
      if (err instanceof Error && err.message === 'CANCELLED') return;
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function createClient() {
    if (!agencyId) {
      setError('یک آژانس ثبت‌شده را انتخاب کنید.');
      return;
    }
    setBusyId('new');
    setError(null);
    try {
      const fields = await stepUp.confirm();
      const result = await issueItApiClient(agencyId, scope, fields);
      setIssuedKey(result);
      setNewClientOpen(false);
      setAgencyId('');
      setNotice('کلاینت API با موفقیت ایجاد شد.');
      await load();
    } catch (err) {
      if (err instanceof Error && err.message === 'CANCELLED') return;
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function changeClient(
    client: ItApiClientRow,
    action: 'toggle' | 'rotate' | 'revoke',
  ) {
    setBusyId(client.id);
    setError(null);
    try {
      if (action === 'rotate') {
        const fields = await stepUp.confirm();
        const result = await updateItApiClient(client.id, {
          regenerate: true,
          ...fields,
        });
        setIssuedKey(result);
        setNotice('کلید قبلی باطل و کلید تازه صادر شد.');
      } else if (action === 'revoke') {
        const fields = await stepUp.confirm();
        await updateItApiClient(client.id, { status: 'REVOKED', ...fields });
        setNotice('کلید برای همیشه لغو شد.');
      } else {
        await updateItApiClient(client.id, {
          status: client.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE',
        });
        setNotice(
          client.status === 'ACTIVE' ? 'کلاینت معلق شد.' : 'کلاینت فعال شد.',
        );
      }
      await load();
    } catch (err) {
      if (err instanceof Error && err.message === 'CANCELLED') return;
      setError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="p-8 text-sm text-[#9fb0c7]">
        در حال دریافت اطلاعات وب‌سرویس‌ها…
      </div>
    );
  }

  return (
    <div className="space-y-5 p-8 text-white" dir="rtl">
      <header>
        <h1 className="text-2xl font-black">وب‌سرویس‌ها و API</h1>
        <p className="mt-2 text-xs text-[#6b7b94]">
          مدیریت درخواست‌ها، کلیدهای دسترسی، مصرف و رخدادهای امنیتی آژانس‌ها
        </p>
      </header>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-xs text-rose-200"
        >
          {error}
        </div>
      )}
      {notice && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-xs text-emerald-200">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)}>
            ×
          </button>
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['کلاینت فعال', data?.kpis.activeClients ?? 0, 'text-emerald-300'],
          ['کل کلیدهای صادرشده', data?.kpis.issuedKeys ?? 0, 'text-blue-300'],
          [
            'درخواست در انتظار',
            data?.kpis.pendingRequests ?? 0,
            'text-amber-300',
          ],
          [
            'رخداد امنیتی امروز',
            data?.kpis.securityEventsToday ?? 0,
            'text-rose-300',
          ],
        ].map(([label, value, color]) => (
          <article
            key={String(label)}
            className="rounded-2xl border border-[#24304a] bg-[#141d2e] p-5"
          >
            <div className={`text-2xl font-black ${color}`}>
              {faDigits(value as number)}
            </div>
            <div className="mt-2 text-xs text-[#8494ac]">{label}</div>
          </article>
        ))}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex rounded-xl border border-[#28344c] bg-[#101827] p-1">
          {(
            [
              ['requests', 'درخواست‌ها', data?.kpis.pendingRequests],
              ['clients', 'آژانس‌ها', data?.clients.length],
              ['events', 'رخدادها', data?.events.length],
            ] as const
          ).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-lg px-4 py-2 text-xs font-bold transition ${tab === key ? 'bg-[#3b82f6] text-white' : 'text-[#9fb0c7] hover:text-white'}`}
            >
              {label}{' '}
              <span className="mr-1 opacity-75">{faDigits(count ?? 0)}</span>
            </button>
          ))}
        </nav>
        {tab === 'clients' && (
          <button
            type="button"
            onClick={() => setNewClientOpen(true)}
            className="rounded-xl bg-[#3b82f6] px-4 py-2.5 text-xs font-extrabold hover:bg-[#4c8ff7]"
          >
            + کلاینت جدید
          </button>
        )}
      </div>

      {tab === 'requests' && (
        <RequestsPanel
          rows={data?.requests ?? []}
          busyId={busyId}
          onDecide={decide}
        />
      )}
      {tab === 'clients' && (
        <ClientsPanel
          rows={clients}
          query={query}
          busyId={busyId}
          onQuery={setQuery}
          onAction={changeClient}
          onSettings={setSettingsClient}
        />
      )}
      {tab === 'events' && <EventsPanel rows={data?.events ?? []} />}

      {settingsClient && (
        <ClientSettingsModal
          client={settingsClient}
          busy={busyId === settingsClient.id}
          onClose={() => setSettingsClient(null)}
          onSaved={async () => {
            setSettingsClient(null);
            setNotice('سیاست کلاینت ذخیره شد.');
            await load();
          }}
          onError={(message) => setError(message)}
          setBusyId={setBusyId}
        />
      )}

      {newClientOpen && (
        <Modal
          title="ایجاد کلاینت API"
          onClose={() => setNewClientOpen(false)}
          variant="dark"
        >
          <label className="mb-2 block text-xs font-bold">آژانس ثبت‌شده</label>
          <select
            value={agencyId}
            onChange={(event) => setAgencyId(event.target.value)}
            className="mb-4 h-11 w-full rounded-xl border border-[#2a3550] bg-[#0d1625] px-3 text-xs outline-none focus:border-blue-400"
          >
            <option value="">انتخاب آژانس</option>
            {(data?.eligibleAgencies ?? []).map((agency) => (
              <option key={agency.id} value={agency.id}>
                {agency.name}
              </option>
            ))}
          </select>
          <label className="mb-2 block text-xs font-bold">دامنه دسترسی</label>
          <select
            value={scope}
            onChange={(event) => setScope(event.target.value as ItApiScope)}
            className="mb-5 h-11 w-full rounded-xl border border-[#2a3550] bg-[#0d1625] px-3 text-xs outline-none focus:border-blue-400"
          >
            {(Object.keys(SCOPE_LABEL) as ItApiScope[]).map((value) => (
              <option key={value} value={value}>
                {SCOPE_LABEL[value]}
              </option>
            ))}
          </select>
          <p className="mb-4 rounded-lg bg-amber-400/10 p-3 text-[11px] leading-6 text-amber-200">
            کلید خام فقط یک بار نمایش داده می‌شود و برای صدور، تأیید دومرحله‌ای
            لازم است.
          </p>
          <button
            type="button"
            disabled={busyId === 'new'}
            onClick={() => void createClient()}
            className="h-11 w-full rounded-xl bg-[#3b82f6] text-xs font-extrabold disabled:opacity-50"
          >
            {busyId === 'new' ? 'در حال صدور…' : 'صدور کلید API'}
          </button>
        </Modal>
      )}

      {issuedKey?.rawKey && (
        <Modal
          title="کلید API صادر شد"
          onClose={() => setIssuedKey(null)}
          variant="dark"
        >
          <p className="mb-3 text-xs leading-6 text-amber-200">
            این کلید دیگر قابل بازیابی نیست. اکنون آن را در محل امن ذخیره کنید.
          </p>
          <code
            dir="ltr"
            className="block break-all rounded-xl border border-[#2a3550] bg-[#0b1220] p-4 text-left text-sm text-emerald-300"
          >
            {issuedKey.rawKey}
          </code>
          <button
            type="button"
            onClick={() =>
              void navigator.clipboard.writeText(issuedKey.rawKey ?? '')
            }
            className="mt-4 h-11 w-full rounded-xl bg-[#3b82f6] text-xs font-extrabold"
          >
            کپی کلید
          </button>
        </Modal>
      )}
      {stepUp.modal}
    </div>
  );
}

function RequestsPanel({
  rows,
  busyId,
  onDecide,
}: {
  rows: ItWebserviceRequestRow[];
  busyId: string | null;
  onDecide: (row: ItWebserviceRequestRow, approve: boolean) => Promise<void>;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[#24304a] bg-[#141d2e]">
      <div className="border-b border-[#24304a] px-5 py-4">
        <h2 className="text-sm font-black">درخواست‌های دسترسی API</h2>
        <p className="mt-1 text-[11px] text-[#6b7b94]">
          تصمیم‌گیری فقط روی درخواست‌های در انتظار امکان‌پذیر است.
        </p>
      </div>
      {rows.length === 0 ? (
        <Empty text="درخواستی ثبت نشده است." />
      ) : (
        <div className="divide-y divide-[#24304a]">
          {rows.map((row) => (
            <article
              key={row.id}
              className="grid gap-4 p-5 md:grid-cols-[1.2fr_1fr_1fr_auto] md:items-center"
            >
              <div>
                <div className="text-xs font-bold">{row.agency}</div>
                <div className="mt-1 text-[10px] text-[#6b7b94]">
                  {formatJalaliDateTime(row.createdAt)}
                </div>
              </div>
              <div className="text-xs text-[#c7d2e2]">
                {SCOPE_LABEL[row.scope]} · {faDigits(row.months)} ماه
              </div>
              <div className="text-xs text-[#c7d2e2]">
                {money(row.priceIrr)} ریال
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={row.status} />
                {row.status === 'PENDING' && (
                  <>
                    <button
                      disabled={busyId === row.id}
                      type="button"
                      onClick={() => void onDecide(row, true)}
                      className="rounded-lg bg-emerald-500/15 px-3 py-2 text-[11px] font-bold text-emerald-300 disabled:opacity-50"
                    >
                      تأیید
                    </button>
                    <button
                      disabled={busyId === row.id}
                      type="button"
                      onClick={() => void onDecide(row, false)}
                      className="rounded-lg bg-rose-500/15 px-3 py-2 text-[11px] font-bold text-rose-300 disabled:opacity-50"
                    >
                      رد
                    </button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ClientsPanel({
  rows,
  query,
  busyId,
  onQuery,
  onAction,
  onSettings,
}: {
  rows: ItApiClientRow[];
  query: string;
  busyId: string | null;
  onQuery: (value: string) => void;
  onAction: (
    row: ItApiClientRow,
    action: 'toggle' | 'rotate' | 'revoke',
  ) => Promise<void>;
  onSettings: (row: ItApiClientRow) => void;
}) {
  const calls = rows.reduce((sum, row) => sum + row.callCount, 0);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-[1fr_auto]">
        <input
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="جستجو در نام آژانس یا شناسه کلید…"
          className="h-11 rounded-xl border border-[#28344c] bg-[#101827] px-4 text-xs outline-none focus:border-blue-400"
        />
        <div className="rounded-xl border border-[#28344c] bg-[#141d2e] px-5 py-3 text-xs text-[#9fb0c7]">
          کل درخواست‌های ثبت‌شده:{' '}
          <strong className="mr-1 text-white">{faDigits(calls)}</strong>
        </div>
      </div>
      <section className="overflow-hidden rounded-2xl border border-[#24304a] bg-[#141d2e]">
        {rows.length === 0 ? (
          <Empty text="کلاینتی مطابق جستجو وجود ندارد." />
        ) : (
          <div className="divide-y divide-[#24304a]">
            {rows.map((row) => (
              <article
                key={row.id}
                className="grid gap-4 p-5 xl:grid-cols-[1.2fr_1fr_1fr_1fr_auto] xl:items-center"
              >
                <div>
                  <div className="text-xs font-bold">{row.agency}</div>
                  <code
                    dir="ltr"
                    className="mt-1 block text-left text-[10px] text-[#6b7b94]"
                  >
                    {row.keyHint}
                  </code>
                  <div className="mt-1 text-[10px] text-[#8494ac]">
                    {row.environment === 'PRODUCTION' ? 'Production' : 'Sandbox'}{' '}
                    ·{' '}
                    {row.flightDomain === 'DOMESTIC'
                      ? 'داخلی'
                      : row.flightDomain === 'INTERNATIONAL'
                        ? 'بین‌المللی'
                        : 'همه پروازها'}
                  </div>
                </div>
                <div className="text-xs text-[#c7d2e2]">
                  {SCOPE_LABEL[row.scope]}
                </div>
                <div>
                  <StatusBadge status={row.status} />
                </div>
                <div className="text-[10px] leading-5 text-[#8494ac]">
                  آخرین استفاده:{' '}
                  {row.lastUsedAt
                    ? formatJalaliDateTime(row.lastUsedAt)
                    : 'هنوز استفاده نشده'}
                  <br />
                  تعداد درخواست: {faDigits(row.callCount)}
                  {row.rateLimitPerMinute != null && (
                    <>
                      <br />
                      Rate Limit: {faDigits(row.rateLimitPerMinute)}/دقیقه
                    </>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onSettings(row)}
                    className="rounded-lg border border-[#33415c] px-2.5 py-1.5 text-[10px] text-[#c7d2e2]"
                  >
                    تنظیمات
                  </button>
                  {row.status !== 'REVOKED' && (
                    <>
                      <button
                        disabled={busyId === row.id}
                        type="button"
                        onClick={() => void onAction(row, 'toggle')}
                        className="rounded-lg border border-[#33415c] px-2.5 py-1.5 text-[10px] text-[#c7d2e2] disabled:opacity-50"
                      >
                        {row.status === 'ACTIVE' ? 'تعلیق' : 'فعال‌سازی'}
                      </button>
                      <button
                        disabled={busyId === row.id}
                        type="button"
                        onClick={() => void onAction(row, 'rotate')}
                        className="rounded-lg border border-blue-400/30 px-2.5 py-1.5 text-[10px] text-blue-300 disabled:opacity-50"
                      >
                        تعویض کلید
                      </button>
                      <button
                        disabled={busyId === row.id}
                        type="button"
                        onClick={() => void onAction(row, 'revoke')}
                        className="rounded-lg border border-rose-400/30 px-2.5 py-1.5 text-[10px] text-rose-300 disabled:opacity-50"
                      >
                        لغو دائمی
                      </button>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ClientSettingsModal({
  client,
  busy,
  onClose,
  onSaved,
  onError,
  setBusyId,
}: {
  client: ItApiClientRow;
  busy: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onError: (message: string) => void;
  setBusyId: (id: string | null) => void;
}) {
  const [capabilities, setCapabilities] = useState<ItApiCapability[]>(
    client.capabilities ?? [],
  );
  const [environment, setEnvironment] = useState<ItApiEnvironment>(
    client.environment,
  );
  const [flightDomain, setFlightDomain] = useState<ItApiFlightDomain>(
    client.flightDomain,
  );
  const [ipText, setIpText] = useState(client.ipWhitelist.join('\n'));
  const [rateLimit, setRateLimit] = useState(
    client.rateLimitPerMinute != null ? String(client.rateLimitPerMinute) : '',
  );
  const [expiresAt, setExpiresAt] = useState(
    client.expiresAt ? client.expiresAt.slice(0, 10) : '',
  );
  const [flightNo, setFlightNo] = useState('');
  const [testResult, setTestResult] = useState<ItAvailabilityTestResult | null>(
    null,
  );
  const [testing, setTesting] = useState(false);

  async function save() {
    setBusyId(client.id);
    try {
      const ips = ipText
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      await updateItApiClient(client.id, {
        capabilities,
        environment,
        flightDomain,
        ipWhitelist: ips,
        rateLimitPerMinute: rateLimit.trim() ? Number(rateLimit) : null,
        expiresAt: expiresAt.trim()
          ? new Date(`${expiresAt}T23:59:59.000Z`).toISOString()
          : null,
      });
      await onSaved();
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function runTester() {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await testItApiAvailability(client.id, flightNo.trim()));
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setTesting(false);
    }
  }

  return (
    <Modal title={`تنظیمات — ${client.agency}`} onClose={onClose} variant="dark">
      <div className="max-h-[70vh] space-y-4 overflow-y-auto pe-1">
        <div>
          <div className="mb-2 text-xs font-bold">Scope</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {ALL_CAPABILITIES.map((cap) => {
              const on = capabilities.includes(cap);
              return (
                <label
                  key={cap}
                  className="flex items-center gap-2 rounded-lg border border-[#2a3550] bg-[#0d1625] px-3 py-2 text-[11px]"
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() =>
                      setCapabilities((prev) =>
                        on ? prev.filter((c) => c !== cap) : [...prev, cap],
                      )
                    }
                  />
                  {CAPABILITY_LABEL[cap]}
                </label>
              );
            })}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs">
            <span className="mb-1 block font-bold">محیط اجرا</span>
            <select
              value={environment}
              onChange={(e) =>
                setEnvironment(e.target.value as ItApiEnvironment)
              }
              className="h-10 w-full rounded-xl border border-[#2a3550] bg-[#0d1625] px-3 text-xs"
            >
              <option value="SANDBOX">Sandbox</option>
              <option value="PRODUCTION">Production</option>
            </select>
          </label>
          <label className="block text-xs">
            <span className="mb-1 block font-bold">دامنه پروازی</span>
            <select
              value={flightDomain}
              onChange={(e) =>
                setFlightDomain(e.target.value as ItApiFlightDomain)
              }
              className="h-10 w-full rounded-xl border border-[#2a3550] bg-[#0d1625] px-3 text-xs"
            >
              <option value="ALL">همه</option>
              <option value="DOMESTIC">فقط داخلی</option>
              <option value="INTERNATIONAL">فقط بین‌المللی</option>
            </select>
          </label>
        </div>

        <label className="block text-xs">
          <span className="mb-1 block font-bold">IP Whitelist (هر خط یک IP)</span>
          <textarea
            value={ipText}
            onChange={(e) => setIpText(e.target.value)}
            rows={3}
            dir="ltr"
            className="w-full rounded-xl border border-[#2a3550] bg-[#0d1625] p-3 text-left text-xs"
            placeholder="خالی = بدون محدودیت"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs">
            <span className="mb-1 block font-bold">Rate Limit (در دقیقه)</span>
            <input
              value={rateLimit}
              onChange={(e) => setRateLimit(e.target.value)}
              inputMode="numeric"
              dir="ltr"
              className="h-10 w-full rounded-xl border border-[#2a3550] bg-[#0d1625] px-3 text-left text-xs"
              placeholder="خالی = فقط سقف سراسری"
            />
          </label>
          <label className="block text-xs">
            <span className="mb-1 block font-bold">تاریخ انقضای کلید</span>
            <div className="h-10 rounded-xl border border-[#2a3550] bg-[#0d1625]">
            <JalaliDatePicker
              label="تاریخ انقضای کلید"
              value={expiresAt}
              onChange={(iso) => setExpiresAt(iso.slice(0, 10))}
              theme="dark"
              singleLine
              testId="api-client-expiry-date"
              placeholder="انتخاب تاریخ"
            />
            </div>
          </label>
        </div>

        <div className="rounded-xl border border-[#2a3550] bg-[#0d1625] p-3">
          <div className="mb-2 text-xs font-bold">آزمایشگر استعلام ظرفیت</div>
          <div className="flex gap-2">
            <input
              value={flightNo}
              onChange={(e) => setFlightNo(e.target.value)}
              placeholder="مثلاً EP-821"
              dir="ltr"
              className="h-10 flex-1 rounded-xl border border-[#2a3550] bg-[#101827] px-3 text-left text-xs"
            />
            <button
              type="button"
              disabled={testing || !flightNo.trim()}
              onClick={() => void runTester()}
              className="rounded-xl bg-[#334155] px-3 text-[11px] font-bold disabled:opacity-50"
            >
              {testing ? '…' : 'تست'}
            </button>
          </div>
          {testResult && (
            <p className="mt-2 text-[11px] leading-6 text-emerald-300">
              {testResult.flightNo}: ظرفیت {faDigits(testResult.capacity)} ·
              باقی‌مانده {faDigits(testResult.seatsLeft)}
            </p>
          )}
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="h-11 w-full rounded-xl bg-[#3b82f6] text-xs font-extrabold disabled:opacity-50"
        >
          {busy ? 'در حال ذخیره…' : 'ذخیره سیاست'}
        </button>
      </div>
    </Modal>
  );
}

function EventsPanel({ rows }: { rows: ItWebservicesOverview['events'] }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[#24304a] bg-[#141d2e]">
      {rows.length === 0 ? (
        <Empty text="رخداد مرتبطی ثبت نشده است." />
      ) : (
        <div className="divide-y divide-[#24304a]">
          {rows.map((row) => (
            <article
              key={row.id}
              className="grid gap-3 p-5 md:grid-cols-[auto_1fr_auto] md:items-center"
            >
              <span
                className={`h-2.5 w-2.5 rounded-full ${row.level === 'ERROR' ? 'bg-rose-400' : row.level === 'WARN' ? 'bg-amber-400' : 'bg-blue-400'}`}
              />
              <div>
                <div className="text-xs font-bold">{row.action}</div>
                <div className="mt-1 text-[10px] leading-5 text-[#8494ac]">
                  {row.actor}
                  {row.detail ? ` · ${row.detail}` : ''}
                </div>
              </div>
              <time className="text-[10px] text-[#6b7b94]">
                {formatJalaliDateTime(row.createdAt)}
              </time>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="px-5 py-14 text-center text-xs text-[#6b7b94]">{text}</div>
  );
}
