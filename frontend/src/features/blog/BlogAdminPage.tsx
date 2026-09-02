import { useCallback, useEffect, useState } from 'react';
import {
  createBlogPost,
  deleteBlogPost,
  fetchAdminBlogPosts,
  fetchBlogStats,
  updateBlogPost,
} from '../../api/blog';
import { uploadFile } from '../../api/files';
import { faDigits } from '../../lib/fa-format';
import { formatJalaliDateTime } from '../../lib/jalali';
import Pagination from '../../components/Pagination';
import ConfirmActionDialog from '../../components/ConfirmActionDialog';
import { usePagination } from '../../hooks/usePagination';
import type {
  BlogCategory,
  BlogPostRow,
  BlogPostStatus,
  BlogStats,
  CreateBlogPostInput,
} from '../../types/blog';

type CategoryFilter = 'all' | BlogCategory;

const CATEGORY_CHIPS: { key: CategoryFilter; label: string }[] = [
  { key: 'all', label: 'همه' },
  { key: 'NEWS', label: 'اخبار پرواز' },
  { key: 'GUIDE', label: 'راهنمای سفر' },
  { key: 'DEST', label: 'مقاصد' },
  { key: 'OFFERS', label: 'تخفیف‌ها' },
];

const CATEGORY_GRADIENT: Record<BlogCategory, string> = {
  NEWS: 'linear-gradient(135deg,#b45309,#f59e0b)',
  GUIDE: 'linear-gradient(135deg,#1e3a8a,#3b82f6)',
  DEST: 'linear-gradient(135deg,#0e7490,#22d3ee)',
  OFFERS: 'linear-gradient(135deg,#9333ea,#c084fc)',
};

const STATUS_META: Record<
  BlogPostStatus,
  { label: string; className: string }
> = {
  PUBLISHED: { label: 'منتشرشده', className: 'bg-[#10b98124] text-[#059669]' },
  DRAFT: { label: 'پیش‌نویس', className: 'bg-[#f59e0b24] text-[#b45309]' },
  SCHEDULED: { label: 'زمان‌بندی‌شده', className: 'bg-[#60a5fa2e] text-[#1d4ed8]' },
};

const emptyForm: CreateBlogPostInput = {
  title: '',
  body: '',
  category: 'GUIDE',
  status: 'DRAFT',
};

export default function BlogAdminPage() {
  const [stats, setStats] = useState<BlogStats | null>(null);
  const [posts, setPosts] = useState<BlogPostRow[] | null>(null);
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<BlogPostRow | null>(null);
  const [form, setForm] = useState<CreateBlogPostInput>(emptyForm);
  const [scheduledAtLocal, setScheduledAtLocal] = useState('');
  const [coverUploading, setCoverUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BlogPostRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async (cat: CategoryFilter) => {
    try {
      const [s, list] = await Promise.all([
        fetchBlogStats(),
        fetchAdminBlogPosts(cat === 'all' ? undefined : cat),
      ]);
      setStats(s);
      setPosts(list);
    } catch {
      setError('خطا در دریافت مقالات بلاگ.');
    }
  }, []);

  useEffect(() => {
    void load(category);
  }, [category, load]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setScheduledAtLocal('');
    setEditorOpen(true);
  }

  function openEdit(post: BlogPostRow) {
    setEditing(post);
    setForm({
      title: post.title,
      body: post.body,
      category: post.category,
      status: post.status,
      coverFileId: post.coverFileId ?? undefined,
    });
    setScheduledAtLocal(
      post.scheduledAt ? post.scheduledAt.slice(0, 16) : '',
    );
    setEditorOpen(true);
  }

  async function onCoverPick(file: File | null) {
    if (!file) return;
    setCoverUploading(true);
    setError(null);
    try {
      const uploaded = await uploadFile(file);
      setForm((f) => ({ ...f, coverFileId: uploaded.id }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در آپلود تصویر.');
    } finally {
      setCoverUploading(false);
    }
  }

  async function onSave(nextStatus: BlogPostStatus) {
    if (nextStatus === 'SCHEDULED' && !scheduledAtLocal) {
      setError('برای زمان‌بندی، تاریخ انتشار را وارد کنید.');
      return;
    }
    const payload: CreateBlogPostInput = {
      ...form,
      status: nextStatus,
      scheduledAt:
        nextStatus === 'SCHEDULED' && scheduledAtLocal
          ? new Date(scheduledAtLocal).toISOString()
          : undefined,
    };
    try {
      if (editing) {
        await updateBlogPost(editing.id, payload);
      } else {
        await createBlogPost(payload);
      }
      setEditorOpen(false);
      await load(category);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در ذخیره مقاله.');
    }
  }

  function requestDelete(post: BlogPostRow) {
    setDeleteTarget(post);
    setDeleteError(null);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteBlogPost(deleteTarget.id);
      setDeleteTarget(null);
      await load(category);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'خطا در حذف مقاله.');
    } finally {
      setDeleteBusy(false);
    }
  }

  const rows = posts ?? [];
  const rowsPager = usePagination(rows);

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-xl font-black text-ink">مدیریت بلاگ</h1>
        <p className="mt-1 text-sm text-muted">
          ایجاد، ویرایش و انتشار مقالات بلاگ blujet
        </p>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-danger/10 p-3 text-sm text-danger">{error}</p>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            label: 'مقالهٔ منتشرشده',
            value: stats ? faDigits(stats.publishedCount) : '—',
            color: 'text-[#059669]',
          },
          {
            label: 'پیش‌نویس',
            value: stats ? faDigits(stats.draftCount) : '—',
            color: 'text-[#b45309]',
          },
          {
            label: 'بازدید کل',
            value: stats
              ? faDigits(
                  stats.totalViews.toLocaleString('en-US').replace(/,/g, '٬'),
                )
              : '—',
            color: 'text-accent',
          },
          {
            label: 'دیدگاه',
            value: stats ? faDigits(stats.commentCount) : '—',
            color: 'text-[#7c3aed]',
          },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-xl border border-border bg-white px-4 py-3"
          >
            <div className={`font-num text-2xl font-black ${kpi.color}`}>
              {kpi.value}
            </div>
            <div className="mt-1 text-xs text-muted">{kpi.label}</div>
          </div>
        ))}
      </div>

      <section className="rounded-xl border border-border bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {CATEGORY_CHIPS.map((c) => (
              <button
                key={c.key}
                onClick={() => setCategory(c.key)}
                className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                  category === c.key
                    ? 'border-accent bg-accent text-white'
                    : 'border-border bg-surface text-muted'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <button
            onClick={openCreate}
            className="rounded-lg bg-accent px-3 py-2 text-xs font-bold text-white"
          >
            + نوشتهٔ جدید
          </button>
        </div>

        {editorOpen && (
          <div className="mb-5 rounded-xl border border-border bg-surface p-4">
            <h2 className="mb-3 text-sm font-bold text-ink">
              {editing ? 'ویرایش مقاله' : 'نوشتن مقالهٔ جدید'}
            </h2>
            <div className="flex flex-col gap-3">
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="عنوان مقاله…"
                className="h-11 rounded-lg border border-border px-3 text-sm outline-none"
              />
              <div className="flex flex-wrap gap-3">
                <select
                  value={form.category}
                  onChange={(e) =>
                    setForm({ ...form, category: e.target.value as BlogCategory })
                  }
                  className="h-11 min-w-[180px] flex-1 rounded-lg border border-border px-3 text-sm outline-none"
                >
                  <option value="NEWS">اخبار پرواز</option>
                  <option value="GUIDE">راهنمای سفر</option>
                  <option value="DEST">مقاصد</option>
                  <option value="OFFERS">تخفیف‌ها</option>
                </select>
                <label className="flex h-11 min-w-[180px] flex-1 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 text-xs text-muted">
                  <input
                    type="file"
                    accept="image/png,image/jpeg"
                    className="hidden"
                    onChange={(e) => void onCoverPick(e.target.files?.[0] ?? null)}
                  />
                  {coverUploading
                    ? 'در حال آپلود…'
                    : form.coverFileId
                      ? 'تصویر کاور انتخاب شد ✓'
                      : 'افزودن تصویر کاور'}
                </label>
              </div>
              <input
                type="datetime-local"
                value={scheduledAtLocal}
                onChange={(e) => setScheduledAtLocal(e.target.value)}
                className="h-11 rounded-lg border border-border px-3 text-sm outline-none"
                aria-label="زمان انتشار (برای زمان‌بندی)"
              />
              <textarea
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                placeholder="متن مقاله را اینجا بنویسید…"
                rows={6}
                className="rounded-lg border border-border p-3 text-sm outline-none"
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => void onSave('PUBLISHED')}
                disabled={!form.title.trim() || !form.body.trim()}
                className="rounded-lg bg-accent px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
              >
                انتشار
              </button>
              <button
                onClick={() => void onSave('DRAFT')}
                disabled={!form.title.trim() || !form.body.trim()}
                className="rounded-lg border border-border px-4 py-2 text-xs font-bold text-ink disabled:opacity-50"
              >
                ذخیرهٔ پیش‌نویس
              </button>
              <button
                onClick={() => void onSave('SCHEDULED')}
                disabled={!form.title.trim() || !form.body.trim() || !scheduledAtLocal}
                className="rounded-lg border border-border px-4 py-2 text-xs font-bold text-accent disabled:opacity-50"
              >
                زمان‌بندی
              </button>
              <button
                onClick={() => setEditorOpen(false)}
                className="px-3 py-2 text-xs font-semibold text-muted"
              >
                انصراف
              </button>
            </div>
          </div>
        )}

        {posts === null ? (
          <p className="py-6 text-center text-sm text-muted">در حال بارگذاری…</p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted">مقاله‌ای یافت نشد.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rowsPager.pageItems.map((p) => {
              const st = STATUS_META[p.status];
              const date = p.publishedAt ?? p.scheduledAt ?? p.createdAt;
              return (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3"
                >
                  <div
                    className="h-[60px] w-[84px] shrink-0 rounded-lg"
                    style={{ background: CATEGORY_GRADIENT[p.category] }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-ink">{p.title}</div>
                    <div className="mt-1 text-[11px] text-muted">
                      {p.categoryLabelFa} · {p.authorName} ·{' '}
                      {formatJalaliDateTime(date)}
                      {p.status === 'PUBLISHED' || p.viewCount > 0
                        ? ` · ${faDigits(p.viewCount.toLocaleString('en-US'))} بازدید`
                        : ''}
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-[10px] font-bold ${st.className}`}
                  >
                    {p.statusLabelFa}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => openEdit(p)}
                      className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-bold text-accent"
                    >
                      ویرایش
                    </button>
                    <button
                      onClick={() => requestDelete(p)}
                      className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-bold text-danger"
                    >
                      حذف
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <Pagination
          page={rowsPager.page}
          totalPages={rowsPager.totalPages}
          onChange={rowsPager.setPage}
          variant="light"
        />
      </section>
      <ConfirmActionDialog
        open={deleteTarget !== null}
        title="حذف مقاله"
        message={deleteTarget ? `مقاله «${deleteTarget.title}» برای همیشه حذف شود؟` : ''}
        confirmLabel="حذف مقاله"
        cancelLabel="انصراف"
        busy={deleteBusy}
        busyLabel="در حال حذف…"
        error={deleteError}
        variant="light"
        testId="delete-blog-post-dialog"
        onCancel={() => {
          setDeleteTarget(null);
          setDeleteError(null);
        }}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
