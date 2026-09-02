import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PublicPageShell from '../../components/public/PublicPageShell';
import { fetchPublicBlogPosts } from '../../api/blog';
import { useLocale, type StoredLocale } from '../../hooks/useLocale';
import { useIsMobile } from '../../hooks/useIsMobile';
import type { BlogCategory, PublicBlogSummary } from '../../types/blog';
import {
  CATEGORY_GRADIENT,
  CATEGORY_LABELS,
  blogCoverUrl,
  formatPublicBlogDate,
  formatPublicCount,
} from './blog-shared';

type CategoryFilter = 'all' | BlogCategory;

const STR: Record<
  StoredLocale,
  {
    heroTitle: string;
    heroDesc: string;
    all: string;
    readMore: string;
    views: string;
    empty: string;
    loading: string;
    error: string;
  }
> = {
  fa: {
    heroTitle: 'بلاگ blujet',
    heroDesc: 'اخبار پرواز، راهنمای سفر، مقاصد و پیشنهادهای ویژه.',
    all: 'همه',
    readMore: 'ادامه مطلب',
    views: 'بازدید',
    empty: 'فعلاً مقاله‌ای منتشر نشده است.',
    loading: 'در حال بارگذاری…',
    error: 'خطا در دریافت مقالات.',
  },
  en: {
    heroTitle: 'blujet Blog',
    heroDesc: 'Flight news, travel guides, destinations, and special offers.',
    all: 'All',
    readMore: 'Read more',
    views: 'views',
    empty: 'No articles published yet.',
    loading: 'Loading…',
    error: 'Error loading articles.',
  },
  ar: {
    heroTitle: 'مدونة blujet',
    heroDesc: 'أخبار الرحلات، أدلة السفر، الوجهات، والعروض الخاصة.',
    all: 'الكل',
    readMore: 'اقرأ المزيد',
    views: 'مشاهدة',
    empty: 'لا توجد مقالات منشورة حالياً.',
    loading: 'جارٍ التحميل…',
    error: 'خطأ في جلب المقالات.',
  },
};

const FILTER_KEYS: CategoryFilter[] = ['all', 'NEWS', 'GUIDE', 'DEST', 'OFFERS'];

export default function BlogPage() {
  const { locale } = useLocale();
  const isMobile = useIsMobile();
  const t = STR[locale];
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [posts, setPosts] = useState<PublicBlogSummary[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    setPosts(null);
    setError(false);
    fetchPublicBlogPosts(category === 'all' ? undefined : category)
      .then(setPosts)
      .catch(() => setError(true));
  }, [category]);

  return (
    <PublicPageShell>
      <section
        style={{
          background: 'linear-gradient(150deg,#0d2640,#124a86)',
          color: '#fff',
          padding: '41px 22px 35px',
          textAlign: 'center',
        }}
      >
        <h1 style={{ fontSize: isMobile ? 24 : 30, fontWeight: 900, margin: '0 0 10px', letterSpacing: '-.5px' }}>
          {t.heroTitle}
        </h1>
        <p style={{ fontSize: 13, color: '#c9dcf3', margin: 0 }}>{t.heroDesc}</p>
      </section>

      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 22px 55px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 22 }}>
          {FILTER_KEYS.map((key) => {
            const active = category === key;
            const label =
              key === 'all' ? t.all : CATEGORY_LABELS[key][locale];
            return (
              <button
                key={key}
                type="button"
                onClick={() => setCategory(key)}
                style={{
                  border: 'none',
                  borderRadius: 18,
                  padding: '7px 14px',
                  fontSize: 12,
                  fontWeight: active ? 800 : 600,
                  cursor: 'pointer',
                  background: active ? '#1668c4' : '#eef1f5',
                  color: active ? '#fff' : '#5a6678',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {error ? (
          <p style={{ textAlign: 'center', color: '#d64545', fontSize: 13 }}>{t.error}</p>
        ) : posts === null ? (
          <p style={{ textAlign: 'center', color: '#8a96a6', fontSize: 13 }}>{t.loading}</p>
        ) : posts.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#8a96a6', fontSize: 13 }} data-testid="blog-empty">
            {t.empty}
          </p>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(3,1fr)',
              gap: 16,
            }}
          >
            {posts.map((p) => {
              const cover = blogCoverUrl(p.coverFileId);
              return (
                <article
                  key={p.slug}
                  data-testid="blog-card"
                  style={{
                    background: '#fff',
                    border: '1px solid #eef1f5',
                    borderRadius: 16,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <div
                    style={{
                      height: 140,
                      background: cover ? undefined : CATEGORY_GRADIENT[p.category],
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }}
                  >
                    {cover ? (
                      <img
                        src={cover}
                        alt=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : null}
                  </div>
                  <div style={{ padding: '16px 16px 14px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#1668c4', marginBottom: 8 }}>
                      {CATEGORY_LABELS[p.category][locale]}
                    </div>
                    <h2 style={{ fontSize: 15, fontWeight: 800, color: '#0d2640', margin: '0 0 8px', lineHeight: 1.5 }}>
                      {p.title}
                    </h2>
                    <p style={{ fontSize: 12, color: '#5a6678', margin: '0 0 12px', lineHeight: 1.7, flex: 1 }}>
                      {p.excerpt}
                      {p.excerpt.length >= 200 ? '…' : ''}
                    </p>
                    <div style={{ fontSize: 11, color: '#8a96a6', marginBottom: 12 }}>
                      {p.authorName}
                      {p.publishedAt ? ` · ${formatPublicBlogDate(p.publishedAt, locale)}` : ''}
                      {p.viewCount > 0
                        ? ` · ${formatPublicCount(p.viewCount, locale)} ${t.views}`
                        : ''}
                    </div>
                    <Link
                      to={`/blog/${p.slug}`}
                      style={{
                        alignSelf: 'flex-start',
                        fontSize: 12,
                        fontWeight: 700,
                        color: '#1668c4',
                        textDecoration: 'none',
                      }}
                    >
                      {t.readMore} ←
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </PublicPageShell>
  );
}
