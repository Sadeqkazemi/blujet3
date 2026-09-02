import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BlogAdminPage from './BlogAdminPage';
import * as blogApi from '../../api/blog';

vi.mock('../../api/blog');
vi.mock('../../api/files', () => ({
  uploadFile: vi.fn(),
}));

const mockStats = {
  publishedCount: 3,
  draftCount: 1,
  totalViews: 148210,
  commentCount: 0,
};

const mockPosts = [
  {
    id: 'p1',
    title: 'راهنمای کامل چک‌این آنلاین',
    slug: 'online-checkin',
    body: 'متن راهنما…',
    category: 'GUIDE' as const,
    categoryLabelFa: 'راهنمای سفر',
    status: 'PUBLISHED' as const,
    statusLabelFa: 'منتشرشده',
    viewCount: 4210,
    publishedAt: '2026-07-01T10:00:00.000Z',
    scheduledAt: null,
    createdAt: '2026-07-01T10:00:00.000Z',
    updatedAt: '2026-07-01T10:00:00.000Z',
    coverFileId: null,
    authorName: 'ادمین سایت',
  },
  {
    id: 'p2',
    title: 'پیش‌نویس تست',
    slug: 'draft-test',
    body: 'متن پیش‌نویس…',
    category: 'NEWS' as const,
    categoryLabelFa: 'اخبار پرواز',
    status: 'DRAFT' as const,
    statusLabelFa: 'پیش‌نویس',
    viewCount: 0,
    publishedAt: null,
    scheduledAt: null,
    createdAt: '2026-07-02T10:00:00.000Z',
    updatedAt: '2026-07-02T10:00:00.000Z',
    coverFileId: null,
    authorName: 'ادمین سایت',
  },
];

describe('BlogAdminPage', () => {
  beforeEach(() => {
    vi.mocked(blogApi.fetchBlogStats).mockResolvedValue(mockStats);
    vi.mocked(blogApi.fetchAdminBlogPosts).mockResolvedValue(mockPosts);
    vi.mocked(blogApi.createBlogPost).mockResolvedValue(mockPosts[0]);
    vi.mocked(blogApi.updateBlogPost).mockResolvedValue(mockPosts[0]);
    vi.mocked(blogApi.deleteBlogPost).mockResolvedValue({ id: 'p2' });
  });

  it('renders KPI stats', async () => {
    render(<BlogAdminPage />);
    expect(await screen.findByText('مقالهٔ منتشرشده')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('۳')).toBeInTheDocument();
      expect(screen.getByText('۱۴۸٬۲۱۰')).toBeInTheDocument();
    });
  });

  it('renders post rows with status badges', async () => {
    render(<BlogAdminPage />);
    expect(await screen.findByText('راهنمای کامل چک‌این آنلاین')).toBeInTheDocument();
    expect(screen.getAllByText('منتشرشده').length).toBeGreaterThan(0);
    expect(screen.getAllByText('پیش‌نویس').length).toBeGreaterThan(1);
  });

  it('filters posts by category', async () => {
    const user = userEvent.setup();
    render(<BlogAdminPage />);
    await screen.findByText('راهنمای کامل چک‌این آنلاین');
    await user.click(screen.getByRole('button', { name: 'اخبار پرواز' }));
    await waitFor(() => {
      expect(blogApi.fetchAdminBlogPosts).toHaveBeenCalledWith('NEWS');
    });
  });

  it('opens create editor', async () => {
    const user = userEvent.setup();
    render(<BlogAdminPage />);
    await screen.findByText('راهنمای کامل چک‌این آنلاین');
    await user.click(screen.getByRole('button', { name: '+ نوشتهٔ جدید' }));
    expect(screen.getByPlaceholderText('عنوان مقاله…')).toBeInTheDocument();
    expect(screen.getByText('نوشتن مقالهٔ جدید')).toBeInTheDocument();
  });

  it('opens edit form', async () => {
    const user = userEvent.setup();
    render(<BlogAdminPage />);
    await screen.findByText('راهنمای کامل چک‌این آنلاین');
    const editButtons = screen.getAllByRole('button', { name: 'ویرایش' });
    await user.click(editButtons[0]);
    expect(screen.getByDisplayValue('راهنمای کامل چک‌این آنلاین')).toBeInTheDocument();
    expect(screen.getByText('ویرایش مقاله')).toBeInTheDocument();
  });

  it('requires an in-app confirmation before deleting a post', async () => {
    const user = userEvent.setup();
    render(<BlogAdminPage />);
    await screen.findByText('راهنمای کامل چک‌این آنلاین');

    await user.click(screen.getAllByRole('button', { name: 'حذف' })[1]);
    expect(screen.getByTestId('delete-blog-post-dialog')).toHaveTextContent('پیش‌نویس تست');
    expect(blogApi.deleteBlogPost).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('delete-blog-post-dialog-confirm'));
    await waitFor(() => expect(blogApi.deleteBlogPost).toHaveBeenCalledWith('p2'));
  });
});
