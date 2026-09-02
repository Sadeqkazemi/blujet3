import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ServicesPage from './ServicesPage';
import * as itApi from '../../api/it-manager';
import type {
  ExternalService,
  InternalService,
  ItServicesResult,
  ServiceReportResult,
  SmsLogResult,
} from '../../types/it-manager';

const INTERNAL: InternalService[] = [
  { id: 'i1', key: 'search', nameFa: 'موتور جستجوی پرواز', enabled: true, uptimePct: 99.99 },
  { id: 'i2', key: 'sms', nameFa: 'سامانه پیامک (SMS)', enabled: true, uptimePct: 99.9 },
];

const EXTERNAL: ExternalService[] = [
  {
    id: 'x1',
    key: 'ext_zarinpal',
    nameFa: 'درگاه پرداخت زرین‌پال',
    provider: 'زرین‌پال',
    endpoint: 'https://api.zarinpal.com/pg/v4',
    method: 'POST',
    timeoutMs: 30000,
    sandbox: false,
    enabled: true,
    hasApiKey: true,
    lastTestAt: null,
    lastTestOk: null,
    lastTestMessage: null,
  },
];

const RESULT: ItServicesResult = { internal: INTERNAL, external: EXTERNAL };

describe('ServicesPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders internal and external service cards and toggles an internal service after confirm', async () => {
    vi.spyOn(itApi, 'fetchItServices').mockResolvedValue(RESULT);
    const toggleSpy = vi.spyOn(itApi, 'toggleInternalService').mockResolvedValue({});

    render(<ServicesPage />);
    expect(await screen.findByText('موتور جستجوی پرواز')).toBeInTheDocument();
    expect(screen.getByText('درگاه پرداخت زرین‌پال')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('switch', { name: 'موتور جستجوی پرواز' }));
    await user.click(await screen.findByRole('button', { name: 'غیرفعال کن' }));
    await waitFor(() => expect(toggleSpy).toHaveBeenCalledWith('search', false));
  });

  it('shows the real test-connection result banner', async () => {
    vi.spyOn(itApi, 'fetchItServices').mockResolvedValue(RESULT);
    vi.spyOn(itApi, 'testExternalService').mockResolvedValue({
      ok: false,
      message: 'مهلت اتصال (30000ms) به پایان رسید',
      service: EXTERNAL[0],
    });

    render(<ServicesPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'تست اتصال' }));

    expect(await screen.findByText('مهلت اتصال (30000ms) به پایان رسید')).toBeInTheDocument();
  });

  it('تنظیمات modal pre-fills current values and saves without an apiKey field when left blank', async () => {
    vi.spyOn(itApi, 'fetchItServices').mockResolvedValue(RESULT);
    const updateSpy = vi.spyOn(itApi, 'updateExternalService').mockResolvedValue(EXTERNAL[0]);

    render(<ServicesPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'تنظیمات' }));

    expect(screen.getByLabelText('نام سرویس')).toHaveValue('درگاه پرداخت زرین‌پال');
    expect(screen.getByLabelText('آدرس Endpoint')).toHaveValue('https://api.zarinpal.com/pg/v4');
    expect(screen.getByLabelText('مهلت اتصال (میلی‌ثانیه)')).toHaveValue('30000');

    await user.clear(screen.getByLabelText('مهلت اتصال (میلی‌ثانیه)'));
    await user.type(screen.getByLabelText('مهلت اتصال (میلی‌ثانیه)'), '15000');
    await user.click(screen.getByRole('button', { name: 'ثبت تغییرات' }));

    await waitFor(() =>
      expect(updateSpy).toHaveBeenCalledWith('x1', {
        nameFa: 'درگاه پرداخت زرین‌پال',
        endpoint: 'https://api.zarinpal.com/pg/v4',
        method: 'POST',
        timeoutMs: 15000,
      }),
    );
  });

  it('تنظیمات modal sends a new apiKey only when the operator typed one', async () => {
    vi.spyOn(itApi, 'fetchItServices').mockResolvedValue(RESULT);
    const updateSpy = vi.spyOn(itApi, 'updateExternalService').mockResolvedValue(EXTERNAL[0]);

    render(<ServicesPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'تنظیمات' }));
    await user.type(screen.getByLabelText('کلید احراز (API Key)'), 'new-secret-key');
    await user.click(screen.getByRole('button', { name: 'ثبت تغییرات' }));

    await waitFor(() =>
      expect(updateSpy).toHaveBeenCalledWith(
        'x1',
        expect.objectContaining({ apiKey: 'new-secret-key' }),
      ),
    );
  });

  it('تنظیمات modal rejects an empty required field without calling the API', async () => {
    vi.spyOn(itApi, 'fetchItServices').mockResolvedValue(RESULT);
    const updateSpy = vi.spyOn(itApi, 'updateExternalService').mockResolvedValue(EXTERNAL[0]);

    render(<ServicesPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'تنظیمات' }));
    await user.clear(screen.getByLabelText('نام سرویس'));
    await user.click(screen.getByRole('button', { name: 'ثبت تغییرات' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('نام سرویس و آدرس Endpoint الزامی است.');
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('shows the real SMS log: today counts, enabled state, and recent messages', async () => {
    vi.spyOn(itApi, 'fetchItServices').mockResolvedValue(RESULT);
    const smsLog: SmsLogResult = {
      enabled: true,
      todaySuccessCount: 42,
      todayFailedCount: 3,
      recent: Array.from({ length: 6 }, (_, index) => ({
        id: `s${index + 1}`,
        phoneMasked: index === 0 ? '0912***4567' : '0935***1122',
        messageType: index === 0 ? 'OTP' as const : 'TEMP_PASSWORD' as const,
        status: index === 1 ? 'FAILED' as const : 'SUCCESS' as const,
        failureReason: index === 1 ? 'ارسال ناموفق: سرویس در دسترس نبود' : null,
        createdAt: '2026-07-20T09:00:00.000Z',
      })),
    };
    vi.spyOn(itApi, 'fetchSmsLog').mockResolvedValue(smsLog);

    render(<ServicesPage />);
    await screen.findByText('موتور جستجوی پرواز');
    const user = userEvent.setup();
    await user.click(screen.getAllByRole('button', { name: 'مشاهده گزارش' })[1]);
    expect(await screen.findByRole('heading', { name: 'سامانه پیامک (SMS)' })).toBeInTheDocument();
    expect(screen.getByText('۴۲')).toBeInTheDocument();
    expect(screen.getAllByText('۳').length).toBeGreaterThan(0);

    const rows = screen.getAllByTestId('sms-log-row');
    expect(rows).toHaveLength(5);
    expect(rows[0]).toHaveTextContent('0912***4567');
    expect(rows[0]).toHaveTextContent('کد یکبار مصرف');
    expect(rows[1]).toHaveTextContent('ارسال ناموفق: سرویس در دسترس نبود');
    await user.click(screen.getByRole('button', { name: 'بعدی' }));
    expect(screen.getAllByTestId('sms-log-row')).toHaveLength(1);
  });

  it('does not render the SMS log section when it fails to load', async () => {
    vi.spyOn(itApi, 'fetchItServices').mockResolvedValue(RESULT);
    vi.spyOn(itApi, 'fetchSmsLog').mockRejectedValue(new Error('network'));

    render(<ServicesPage />);
    await screen.findByText('موتور جستجوی پرواز');
    const user = userEvent.setup();
    await user.click(screen.getAllByRole('button', { name: 'مشاهده گزارش' })[1]);
    expect(await screen.findByRole('alert')).toHaveTextContent('گزارش این سرویس دریافت نشد');
  });

  it('loads the selected service report with exactly five real records per page', async () => {
    vi.spyOn(itApi, 'fetchItServices').mockResolvedValue(RESULT);
    const report: ServiceReportResult = {
      service: { id: 'x1', key: 'ext_zarinpal', nameFa: 'درگاه پرداخت زرین‌پال' },
      items: Array.from({ length: 5 }, (_, index) => ({
        id: `e${index + 1}`,
        action: `SERVICE_EVENT_${index + 1}`,
        detail: `رویداد واقعی ${index + 1}`,
        actorName: 'UAT IT Manager',
        createdAt: '2026-07-20T09:00:00.000Z',
        level: 'info',
      })),
      total: 6,
      page: 1,
      limit: 5,
    };
    const reportSpy = vi.spyOn(itApi, 'fetchServiceReport').mockResolvedValue(report);

    render(<ServicesPage />);
    await screen.findByText('موتور جستجوی پرواز');
    const user = userEvent.setup();
    await user.click(screen.getAllByRole('button', { name: 'مشاهده گزارش' })[2]);

    expect(await screen.findByRole('heading', { name: 'گزارش درگاه پرداخت زرین‌پال' })).toBeInTheDocument();
    expect(screen.getAllByTestId('service-report-row')).toHaveLength(5);
    expect(reportSpy).toHaveBeenCalledWith('external', 'x1', 1, 5);
  });
});
