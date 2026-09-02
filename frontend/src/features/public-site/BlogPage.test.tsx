import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BlogPage from './BlogPage';
import BlogPostPage from './BlogPostPage';
import * as blogApi from '../../api/blog';
import * as useAuthModule from '../../hooks/useAuth';
import * as useLocaleModule from '../../hooks/useLocale';
import * as useCareersEnabledModule from '../../hooks/useCareersEnabled';

vi.mock('../../api/blog');

function mockLocale(locale: 'fa' | 'en' | 'ar' = 'fa') {
  vi.spyOn(useLocaleModule, 'useLocale').mockReturnValue({ locale, setLocale: vi.fn() });
}

const mockPosts = [
  {
    slug: 'online-checkin-guide',
    title: 'راهنمای چک‌این آنلاین',
    category: 'GUIDE' as const,
    categoryLabelFa: 'راهنمای سفر',
    authorName: 'ادمین سایت',
    publishedAt: '2026-07-01T10:00:00.000Z',
    viewCount: 4210,
    coverFileId: null,
    excerpt: 'برای چک‌این آنلاین…',
  },
];

const mockDetail = {
  slug: 'online-checkin-guide',
  title: 'راهنمای چک‌این آنلاین',
  body: 'متن کامل مقاله برای نمایش.',
  category: 'GUIDE' as const,
  categoryLabelFa: 'راهنمای سفر',
  authorName: 'ادمین سایت',
  publishedAt: '2026-07-01T10:00:00.000Z',
  viewCount: 4211,
  coverFileId: null,
};

beforeEach(() => {
  vi.restoreAllMocks();
  mockLocale('fa');
  vi.spyOn(useCareersEnabledModule, 'useCareersEnabled').mockReturnValue(false);
  vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
    status: 'unauthenticated',
    user: null,
    requestLogin: vi.fn(),
    confirmTwoFactor: vi.fn(),
    agencyLogin: vi.fn(),
    signOut: vi.fn(),
  });
});

describe('BlogPage', () => {
  beforeEach(() => {
    vi.mocked(blogApi.fetchPublicBlogPosts).mockResolvedValue(mockPosts);
  });

  it('renders blog cards and category filter', async () => {
    render(
      <MemoryRouter>
        <BlogPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText('راهنمای چک‌این آنلاین')).toBeInTheDocument();
    expect(screen.getByTestId('blog-card')).toBeInTheDocument();
  });

  it('filters by category chip', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <BlogPage />
      </MemoryRouter>,
    );
    await screen.findByText('راهنمای چک‌این آنلاین');
    await user.click(screen.getByRole('button', { name: 'اخبار پرواز' }));
    await waitFor(() => {
      expect(blogApi.fetchPublicBlogPosts).toHaveBeenCalledWith('NEWS');
    });
  });
});

describe('BlogPostPage', () => {
  beforeEach(() => {
    vi.mocked(blogApi.fetchPublicBlogPost).mockResolvedValue(mockDetail);
  });

  function renderPost(slug = 'online-checkin-guide') {
    return render(
      <MemoryRouter initialEntries={[`/blog/${slug}`]}>
        <Routes>
          <Route path="/blog/:slug" element={<BlogPostPage />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('renders article body', async () => {
    renderPost();
    expect(await screen.findByTestId('blog-body')).toHaveTextContent('متن کامل مقاله');
  });

  it('shows not found on error', async () => {
    vi.mocked(blogApi.fetchPublicBlogPost).mockRejectedValue(new Error('404'));
    renderPost('missing');
    expect(await screen.findByTestId('blog-not-found')).toBeInTheDocument();
  });
});
