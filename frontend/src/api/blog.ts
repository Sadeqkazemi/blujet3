import { apiDelete, apiGet, apiPatch, apiPost } from './http';
import type {
  BlogPostRow,
  BlogStats,
  CreateBlogPostInput,
  PublicBlogDetail,
  PublicBlogSummary,
  UpdateBlogPostInput,
} from '../types/blog';

// ── Public ────────────────────────────────────────────────────────────
export function fetchPublicBlogPosts(category?: string) {
  const qs = category ? `?category=${category}` : '';
  return apiGet<PublicBlogSummary[]>(`/blog/posts${qs}`);
}

export function fetchPublicBlogPost(slug: string) {
  return apiGet<PublicBlogDetail>(`/blog/posts/${slug}`);
}

// ── SITE_ADMIN ────────────────────────────────────────────────────────
export function fetchBlogStats() {
  return apiGet<BlogStats>('/blog/admin/stats');
}

export function fetchAdminBlogPosts(category?: string) {
  const qs = category && category !== 'all' ? `?category=${category}` : '';
  return apiGet<BlogPostRow[]>(`/blog/admin/posts${qs}`);
}

export function fetchAdminBlogPost(id: string) {
  return apiGet<BlogPostRow>(`/blog/admin/posts/${id}`);
}

export function createBlogPost(input: CreateBlogPostInput) {
  return apiPost<BlogPostRow>('/blog/admin/posts', input);
}

export function updateBlogPost(id: string, input: UpdateBlogPostInput) {
  return apiPatch<BlogPostRow>(`/blog/admin/posts/${id}`, input);
}

export function deleteBlogPost(id: string) {
  return apiDelete<{ id: string }>(`/blog/admin/posts/${id}`);
}
