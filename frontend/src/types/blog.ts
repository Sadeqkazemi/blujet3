export type BlogCategory = 'NEWS' | 'GUIDE' | 'DEST' | 'OFFERS';
export type BlogPostStatus = 'DRAFT' | 'PUBLISHED' | 'SCHEDULED';

export interface BlogStats {
  publishedCount: number;
  draftCount: number;
  totalViews: number;
  commentCount: number;
}

export interface BlogPostRow {
  id: string;
  title: string;
  slug: string;
  body: string;
  category: BlogCategory;
  categoryLabelFa: string;
  status: BlogPostStatus;
  statusLabelFa: string;
  viewCount: number;
  publishedAt: string | null;
  scheduledAt: string | null;
  createdAt: string;
  updatedAt: string;
  coverFileId: string | null;
  authorName: string;
}

export interface CreateBlogPostInput {
  title: string;
  body: string;
  category: BlogCategory;
  status?: BlogPostStatus;
  coverFileId?: string;
  scheduledAt?: string;
  slug?: string;
}

export type UpdateBlogPostInput = Partial<CreateBlogPostInput> & {
  coverFileId?: string | null;
  scheduledAt?: string | null;
};

export interface PublicBlogSummary {
  slug: string;
  title: string;
  category: BlogCategory;
  categoryLabelFa: string;
  authorName: string;
  publishedAt: string | null;
  viewCount: number;
  coverFileId: string | null;
  excerpt: string;
}

export interface PublicBlogDetail extends Omit<PublicBlogSummary, 'excerpt'> {
  body: string;
}
