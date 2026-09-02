import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import PublicPageShell from '../../components/public/PublicPageShell';
import { fetchPublicBlogPost } from '../../api/blog';
import { useLocale, type StoredLocale } from '../../hooks/useLocale';
import { useIsMobile } from '../../hooks/useIsMobile';
import type { PublicBlogDetail } from '../../types/blog';
import {
  CATEGORY_GRADIENT,
  CATEGORY_LABELS,
  blogCoverUrl,
  formatPublicBlogDate,
  formatPublicCount,
} from './blog-shared';

const STR: Record<
  StoredLocale,
  { back: string; loading: string; notFound: string; views: string }
> = {
  fa: { back: '← بازگشت به بلاگ', loading: 'در حال بارگذاری…', notFound: 'مقاله یافت نشد.', views: 'بازدید' },
  en: { back: '← Back to blog', loading: 'Loading…', notFound: 'Article not found.', views: 'views' },
  ar: { back: '← العودة إلى المدونة', loading: 'جارٍ التحميل…', notFound: 'المقال غير موجود.', views: 'مشاهدة' },
};

export default function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const { locale } = useLocale();
  const isMobile = useIsMobile();
  const t = STR[locale];
  const [post, setPost] = useState<PublicBlogDetail | null | undefined>(undefined);

  useEffect(() => {
    if (!slug) {
      setPost(null);
      return;
    }
    setPost(undefined);
    fetchPublicBlogPost(slug)
      .then(setPost)
      .catch(() => setPost(null));
  }, [slug]);

  return (
    <PublicPageShell>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: isMobile ? '24px 18px 55px' : '36px 22px 55px' }}>
        <Link
          to="/blog"
          style={{ display: 'inline-block', marginBottom: 20, fontSize: 12, fontWeight: 700, color: '#1668c4', textDecoration: 'none' }}
        >
          {t.back}
        </Link>

        {post === undefined ? (
          <p style={{ textAlign: 'center', color: '#8a96a6', fontSize: 13 }}>{t.loading}</p>
        ) : post === null ? (
          <p style={{ textAlign: 'center', color: '#d64545', fontSize: 13 }} data-testid="blog-not-found">
            {t.notFound}
          </p>
        ) : (
          <article>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#1668c4', marginBottom: 10 }}>
              {CATEGORY_LABELS[post.category][locale]}
            </div>
            <h1
              style={{
                fontSize: isMobile ? 24 : 30,
                fontWeight: 900,
                color: '#0d2640',
                margin: '0 0 12px',
                lineHeight: 1.35,
                letterSpacing: '-.4px',
              }}
            >
              {post.title}
            </h1>
            <div style={{ fontSize: 12, color: '#8a96a6', marginBottom: 22 }}>
              {post.authorName}
              {post.publishedAt ? ` · ${formatPublicBlogDate(post.publishedAt, locale)}` : ''}
              {post.viewCount > 0
                ? ` · ${formatPublicCount(post.viewCount, locale)} ${t.views}`
                : ''}
            </div>

            {(() => {
              const cover = blogCoverUrl(post.coverFileId);
              if (!cover) {
                return (
                  <div
                    style={{
                      height: 220,
                      borderRadius: 16,
                      marginBottom: 24,
                      background: CATEGORY_GRADIENT[post.category],
                    }}
                  />
                );
              }
              return (
                <img
                  src={cover}
                  alt=""
                  style={{
                    width: '100%',
                    maxHeight: 360,
                    objectFit: 'cover',
                    borderRadius: 16,
                    marginBottom: 24,
                  }}
                />
              );
            })()}

            <div
              data-testid="blog-body"
              style={{
                fontSize: 14,
                color: '#334155',
                lineHeight: 1.95,
                whiteSpace: 'pre-wrap',
              }}
            >
              {post.body}
            </div>
          </article>
        )}
      </div>
    </PublicPageShell>
  );
}
