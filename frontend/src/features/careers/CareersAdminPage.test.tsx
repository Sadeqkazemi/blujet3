import { render, screen, within, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CareersAdminPage from './CareersAdminPage';
import * as careersApi from '../../api/careers';
import * as filesApi from '../../api/files';
import type { JobApplicationDetail, JobApplicationRow, JobPosting } from '../../types/careers';

function posting(overrides: Partial<JobPosting> = {}): JobPosting {
  return {
    id: 'p1',
    title: 'کارشناس پشتیبانی مسافران',
    dept: 'پشتیبانی',
    city: 'تهران',
    type: 'FULL_TIME',
    description: 'پاسخگویی به مسافران',
    generalReqs: ['حداقل ۲ سال سابقه'],
    specialReqs: ['آشنایی با Excel'],
    active: true,
    imageFileId: null,
    imageUrl: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

function appRow(overrides: Partial<JobApplicationRow> = {}): JobApplicationRow {
  return {
    id: 'a1',
    name: 'نگار رضایی',
    jobTitle: 'کارشناس پشتیبانی مسافران',
    nationalId: '0012345679',
    phone: '09121234567',
    email: null,
    at: '2026-07-20T00:00:00.000Z',
    status: 'SUBMITTED',
    hasResume: true,
    eduCount: 1,
    workCount: 0,
    assigneeLabelFa: null,
    ...overrides,
  };
}

function appDetail(overrides: Partial<JobApplicationDetail> = {}): JobApplicationDetail {
  return {
    id: 'a1',
    name: 'نگار رضایی',
    jobTitle: 'کارشناس پشتیبانی مسافران',
    nationalId: '0012345679',
    fatherName: null,
    birthDate: null,
    phone: '09121234567',
    email: null,
    residenceAddress: null,
    gender: null,
    military: null,
    exemptionType: null,
    skills: null,
    eduEntries: [],
    workEntries: [],
    langEntries: [],
    hasResume: true,
    resumeFileName: 'resume.pdf',
    status: 'SUBMITTED',
    canAct: true,
    history: [{ step: 'submitted', label: 'ثبت درخواست توسط متقاضی', at: '2026-07-20T00:00:00.000Z' }],
    referralTargets: [{ id: 'm1', labelFa: 'رضا مرادی (مدیر بازرگانی)' }],
    ...overrides,
  };
}

function mockLists(postings: JobPosting[] = [posting()], apps: JobApplicationRow[] = [appRow()]) {
  vi.spyOn(careersApi, 'fetchAllPostings').mockResolvedValue(postings);
  vi.spyOn(careersApi, 'fetchCareersSettings').mockResolvedValue({ enabled: false });
  vi.spyOn(careersApi, 'fetchApplications').mockResolvedValue(apps);
}

describe('CareersAdminPage', () => {
  it('shows three tabs and ads list by default', async () => {
    mockLists();
    render(<CareersAdminPage />);

    expect(await screen.findByRole('button', { name: 'ایجاد فرصت شغلی' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'آگهی‌ها' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'درخواست‌های استخدام' })).toBeInTheDocument();
    expect(await screen.findByText('کارشناس پشتیبانی مسافران')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'نمایش لینک فرصت‌های شغلی در فوتر' })).toBeInTheDocument();
  });

  it('creates a posting from the create tab with description', async () => {
    mockLists([]);
    const create = vi.spyOn(careersApi, 'createPosting').mockResolvedValue(posting({ id: 'p2' }));

    const { default: userEvent } = await import('@testing-library/user-event');
    render(<CareersAdminPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'ایجاد فرصت شغلی' }));
    expect(await screen.findByPlaceholderText('عنوان شغل *')).toBeInTheDocument();
    await userEvent.type(screen.getByPlaceholderText('عنوان شغل *'), 'توسعه‌دهنده فرانت‌اند');
    await userEvent.type(screen.getByPlaceholderText('واحد *'), 'IT');
    await userEvent.type(screen.getByPlaceholderText('شهر *'), 'تهران');
    await userEvent.type(screen.getByPlaceholderText('متن توضیحی آگهی…'), 'توضیح شغل');
    await userEvent.click(screen.getByRole('button', { name: 'ثبت فرصت شغلی' }));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'توسعه‌دهنده فرانت‌اند',
          dept: 'IT',
          city: 'تهران',
          description: 'توضیح شغل',
        }),
      ),
    );
  });

  it('uploads an image and links it to the new job posting', async () => {
    mockLists([]);
    vi.spyOn(filesApi, 'uploadFile').mockResolvedValue({
      id: 'job-image-1',
      fileName: 'job.png',
      sizeBytes: 4,
    });
    const create = vi.spyOn(careersApi, 'createPosting').mockResolvedValue(
      posting({ id: 'p2', imageFileId: 'job-image-1' }),
    );
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:job-image');
    const { default: userEvent } = await import('@testing-library/user-event');
    const { container } = render(<CareersAdminPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'ایجاد فرصت شغلی' }));
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    await userEvent.upload(input!, new File(['png'], 'job.png', { type: 'image/png' }));
    await userEvent.type(screen.getByPlaceholderText('عنوان شغل *'), 'کارشناس محتوا');
    await userEvent.type(screen.getByPlaceholderText('واحد *'), 'محتوا');
    await userEvent.type(screen.getByPlaceholderText('شهر *'), 'تهران');
    await userEvent.click(screen.getByRole('button', { name: 'ثبت فرصت شغلی' }));

    await waitFor(() => {
      expect(filesApi.uploadFile).toHaveBeenCalled();
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ imageFileId: 'job-image-1' }),
      );
    });
  });

  it('toggles footer visibility (نمایش لینک در فوتر)', async () => {
    mockLists();
    const update = vi
      .spyOn(careersApi, 'updateCareersSettings')
      .mockResolvedValue({ enabled: true });

    const { default: userEvent } = await import('@testing-library/user-event');
    render(<CareersAdminPage />);

    await userEvent.click(
      await screen.findByRole('switch', { name: 'نمایش لینک فرصت‌های شغلی در فوتر' }),
    );
    expect(update).toHaveBeenCalledWith(true);
  });

  it('opens applications tab and shows resume document in detail', async () => {
    mockLists();
    vi.spyOn(careersApi, 'fetchApplicationDetail').mockResolvedValue(appDetail());

    const { default: userEvent } = await import('@testing-library/user-event');
    render(<CareersAdminPage />);

    await userEvent.click(screen.getByRole('button', { name: 'درخواست‌های استخدام' }));
    await userEvent.click(await screen.findByRole('button', { name: /نگار رضایی/ }));
    const dialog = await screen.findByRole('dialog', { name: /نگار رضایی/ });
    expect(within(dialog).getByText(/دانلود رزومه/)).toBeInTheDocument();
    expect(within(dialog).getByText('اسناد آپلودشده')).toBeInTheDocument();
  });

  it('refers an application to a selected manager', async () => {
    mockLists();
    vi.spyOn(careersApi, 'fetchApplicationDetail').mockResolvedValue(appDetail());
    const refer = vi
      .spyOn(careersApi, 'referApplication')
      .mockResolvedValue({ id: 'a1', status: 'REFERRED' });

    const { default: userEvent } = await import('@testing-library/user-event');
    render(<CareersAdminPage />);

    await userEvent.click(screen.getByRole('button', { name: 'درخواست‌های استخدام' }));
    await userEvent.click(await screen.findByRole('button', { name: /نگار رضایی/ }));
    const dialog = await screen.findByRole('dialog', { name: /نگار رضایی/ });
    await userEvent.selectOptions(within(dialog).getByLabelText('گیرنده ارجاع'), 'm1');
    await userEvent.click(within(dialog).getByRole('button', { name: 'ثبت ارجاع' }));
    expect(refer).toHaveBeenCalledWith('a1', 'm1');
  });
});
