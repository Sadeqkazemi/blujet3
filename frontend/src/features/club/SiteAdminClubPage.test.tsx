import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import SiteAdminClubPage from './SiteAdminClubPage';
import * as clubApi from '../../api/club';
import type { ClubMembersResult, ClubSubmittedCardRequest } from '../../types/club';

const MEMBERS: ClubMembersResult = {
  members: [
    {
      id: 'm1',
      fullName: 'نگار رضایی',
      email: 'negar@email.com',
      birthDate: '1993-08-05T00:00:00.000Z',
      joinDate: '2025-05-31T00:00:00.000Z',
      points: 12450,
      level: 'GOLD',
      cardStatus: 'ISSUED',
      cardNo: 'GOLD-8842',
      issuedByLabelFa: 'رئیس هیئت مدیره',
      nationalId: '0012345678',
    },
    {
      id: 'm2',
      fullName: 'محمد کریمی',
      email: 'm.karimi@email.com',
      birthDate: null,
      joinDate: '2026-01-20T00:00:00.000Z',
      points: 6200,
      level: 'GOLD',
      cardStatus: 'NONE',
      cardNo: null,
      issuedByLabelFa: null,
      nationalId: '0012345679',
    },
  ],
  kpis: {
    totalMembers: 4,
    issuedCards: 3,
    pendingRequests: 0,
    submittedRequests: 1,
    tierCounts: { SILVER: 1, GOLD: 2, PLATINUM: 1 },
  },
};

const SUBMITTED: ClubSubmittedCardRequest = {
  id: 's1',
  memberId: 'm2',
  member: {
    id: 'm2',
    fullName: 'محمد کریمی',
    email: 'm.karimi@email.com',
    points: 6200,
    level: 'GOLD',
    birthDate: null,
    joinDate: '2026-01-20T00:00:00.000Z',
    nationalId: '0012345679',
  },
  level: 'GOLD',
  points: 6200,
  status: 'SUBMITTED',
  assignedTo: null,
  cardNo: null,
  history: [{ step: 'submitted', labelFa: 'ثبت درخواست صدور کارت', at: '۱۴۰۵/۰۴/۰۱' }],
  createdAt: '2026-07-01T00:00:00.000Z',
};

const REFERRED: ClubSubmittedCardRequest = {
  ...SUBMITTED,
  id: 's2',
  status: 'REFERRED',
  assignedTo: 'SENIOR',
  history: [
    ...SUBMITTED.history,
    { step: 'referred', labelFa: 'ارجاع به مدیر ارشد', at: '۱۴۰۵/۰۴/۰۲' },
  ],
};

function renderPage() {
  return render(
    <MemoryRouter>
      <SiteAdminClubPage />
    </MemoryRouter>,
  );
}

describe('SiteAdminClubPage', () => {
  it('renders 3 KPIs, card requests, member profiles, VIP list and Excel button', async () => {
    vi.spyOn(clubApi, 'fetchClubMembers').mockResolvedValue(MEMBERS);
    vi.spyOn(clubApi, 'fetchSubmittedCardRequests').mockResolvedValue([SUBMITTED, REFERRED]);

    renderPage();

    expect(await screen.findByText('باشگاه مشتریان')).toBeInTheDocument();
    expect(screen.getByText('اعضای باشگاه')).toBeInTheDocument();
    expect(screen.getByText('درخواست‌های در انتظار')).toBeInTheDocument();
    expect(screen.getByText('کارت‌های صادرشده')).toBeInTheDocument();
    expect(screen.getByText('درخواست‌های صدور کارت')).toBeInTheDocument();
    expect(screen.getByText('پروفایل اعضا')).toBeInTheDocument();
    expect(screen.getByText(/فهرست مشتریان VIP/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /دانلود اکسل/ })).toBeInTheDocument();
    expect(screen.getByText('در انتظار بررسی')).toBeInTheDocument();
    expect(screen.getByText('ارجاع‌شده')).toBeInTheDocument();
    expect(screen.getAllByText(/GOLD-8842/).length).toBeGreaterThan(0);
  });

  it('refers a submitted card request to senior manager', async () => {
    vi.spyOn(clubApi, 'fetchClubMembers').mockResolvedValue(MEMBERS);
    vi.spyOn(clubApi, 'fetchSubmittedCardRequests').mockResolvedValue([SUBMITTED]);
    const refer = vi.spyOn(clubApi, 'referCardRequest').mockResolvedValue({
      ...SUBMITTED,
      status: 'REFERRED',
      assignedTo: 'SENIOR',
    });

    renderPage();
    // Request row is first; open its modal (name also appears in member profiles).
    const requestRows = await screen.findAllByText('محمد کریمی');
    await userEvent.click(requestRows[0]!);
    expect(await screen.findByText('ارجاع به مدیران')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'ارجاع به مدیر ارشد' }));
    await waitFor(() => expect(refer).toHaveBeenCalledWith('s1', 'SENIOR'));
  });

  it('paginates member profiles at 10 per page', async () => {
    const many: ClubMembersResult = {
      members: Array.from({ length: 12 }, (_, i) => ({
        id: `m${i + 1}`,
        fullName: `عضو ${i + 1}`,
        email: `m${i + 1}@ex.com`,
        birthDate: null,
        joinDate: '2026-01-01T00:00:00.000Z',
        points: 1000 + i,
        level: 'SILVER' as const,
        cardStatus: 'NONE' as const,
        cardNo: null,
        issuedByLabelFa: null,
        nationalId: `00123456${String(i).padStart(2, '0')}`,
      })),
      kpis: {
        totalMembers: 12,
        issuedCards: 0,
        pendingRequests: 0,
        submittedRequests: 0,
        tierCounts: { SILVER: 12, GOLD: 0, PLATINUM: 0 },
      },
    };
    vi.spyOn(clubApi, 'fetchClubMembers').mockResolvedValue(many);
    vi.spyOn(clubApi, 'fetchSubmittedCardRequests').mockResolvedValue([]);

    renderPage();
    expect(await screen.findByText('عضو 1')).toBeInTheDocument();
    expect(screen.getByText('عضو 10')).toBeInTheDocument();
    expect(screen.queryByText('عضو 11')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'بعدی' }));
    expect(await screen.findByText('عضو 11')).toBeInTheDocument();
  });
});
