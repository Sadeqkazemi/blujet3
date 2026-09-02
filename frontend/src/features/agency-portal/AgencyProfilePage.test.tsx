import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AgencyProfilePage from './AgencyProfilePage';
import * as portalApi from '../../api/agency-portal';
import * as useLocaleModule from '../../hooks/useLocale';
import type { AgencyDocument, AgencyProfile } from '../../types/agency-portal';

function mockLocale(locale: 'fa' | 'en' | 'ar') {
  vi.spyOn(useLocaleModule, 'useLocale').mockReturnValue({ locale, setLocale: vi.fn() });
}

afterEach(() => {
  vi.restoreAllMocks();
});

const PROFILE: AgencyProfile = {
  fullName: 'آژانس blujet',
  managerName: 'کامران یوسفی',
  licenseNo: 'AG-10234',
  phone: '+989120000002',
  email: 'info@blujet-agency.example',
  city: 'تهران',
  address: 'تهران، خیابان ولیعصر',
  tier: 'GOLD',
  isActive: true,
  suspendedAt: null,
  suspendReason: null,
  joinedAt: '2023-04-10T00:00:00.000Z',
  isTemporaryReadOnly: false,
};

const UAT_PROFILE: AgencyProfile = {
  fullName: 'UAT Agency',
  managerName: null,
  licenseNo: null,
  phone: '+989000000001',
  email: null,
  city: null,
  address: null,
  tier: null,
  isActive: true,
  suspendedAt: null,
  suspendReason: null,
  joinedAt: '2026-08-01T00:00:00.000Z',
  isTemporaryReadOnly: true,
};

const DOCUMENTS: AgencyDocument[] = [
  {
    id: 'd1',
    docType: 'LICENSE',
    status: 'PENDING',
    createdAt: '2026-07-01T00:00:00.000Z',
    file: { fileName: 'license.pdf', sizeBytes: 1024, mimeType: 'application/pdf' },
  },
];

describe('AgencyProfilePage', () => {
  it('renders read-only profile fields and the uploaded documents list', async () => {
    vi.spyOn(portalApi, 'fetchProfile').mockResolvedValue(PROFILE);
    vi.spyOn(portalApi, 'fetchDocuments').mockResolvedValue(DOCUMENTS);

    render(<AgencyProfilePage />);

    expect(await screen.findByText('کامران یوسفی')).toBeInTheDocument();
    expect(screen.getByText('AG-10234')).toBeInTheDocument();
    expect(screen.getByText(/license\.pdf/)).toBeInTheDocument();
    expect(screen.getByText('در انتظار بررسی')).toBeInTheDocument();
  });

  it('renders translated headings, field labels, and document status in English', async () => {
    mockLocale('en');
    vi.spyOn(portalApi, 'fetchProfile').mockResolvedValue(PROFILE);
    vi.spyOn(portalApi, 'fetchDocuments').mockResolvedValue(DOCUMENTS);
    render(<AgencyProfilePage />);

    expect(await screen.findByText('License Number')).toBeInTheDocument();
    expect(screen.getByText('Gold Partner Agency')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('renders translated headings and document status in Arabic', async () => {
    mockLocale('ar');
    vi.spyOn(portalApi, 'fetchProfile').mockResolvedValue(PROFILE);
    vi.spyOn(portalApi, 'fetchDocuments').mockResolvedValue(DOCUMENTS);
    render(<AgencyProfilePage />);

    expect(await screen.findByText('قيد المراجعة')).toBeInTheDocument();
  });

  it('renders a nullable UAT agency profile and still exposes the operational document uploader', async () => {
    vi.spyOn(portalApi, 'fetchProfile').mockResolvedValue(UAT_PROFILE);
    vi.spyOn(portalApi, 'fetchDocuments').mockResolvedValue([]);
    const upload = vi.spyOn(portalApi, 'uploadDocument').mockResolvedValue(DOCUMENTS[0]);
    const user = userEvent.setup();

    const { container } = render(<AgencyProfilePage />);

    expect(await screen.findByText('اطلاعات آژانس')).toBeInTheDocument();
    // managerName, licenseNo, city, email, and partnership type are all
    // null — every one of them must render as the em-dash placeholder,
    // never a fabricated value like "NORMAL" or a fake license number.
    expect(screen.getAllByText('—')).toHaveLength(5);
    expect(screen.getByRole('button', { name: /افزودن مدرک/ })).toBeInTheDocument();
    expect(screen.getByText('مدارک ارسالی')).toBeInTheDocument();
    expect(screen.getByText('مدرکی آپلود نشده است.')).toBeInTheDocument();

    const file = new File(['license'], 'agency-license.pdf', { type: 'application/pdf' });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);
    expect(screen.getByText('agency-license.pdf')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'ارسال مدرک' }));
    expect(upload).toHaveBeenCalledWith(file, 'LICENSE');
  });
});
