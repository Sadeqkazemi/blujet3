import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createPosting,
  fetchAllPostings,
  fetchApplicationDetail,
  fetchApplicationResume,
  fetchApplications,
  fetchCareersSettings,
  hireApplication,
  referApplication,
  rejectApplication,
  updateCareersSettings,
  updatePosting,
} from '../../api/careers';
import { deleteFile, uploadFile } from '../../api/files';
import { faDigits } from '../../lib/fa-format';
import { formatJalaliDateTime } from '../../lib/jalali';
import Modal from '../../components/Modal';
import Pagination from '../../components/Pagination';
import { usePagination } from '../../hooks/usePagination';
import { jobPostingImageUrl } from '../public-site/site-content-shared';
import type {
  CreateJobPostingInput,
  JobApplicationDetail,
  JobApplicationRow,
  JobApplicationStatus,
  JobPosting,
  JobType,
} from '../../types/careers';

const JOB_TYPE_LABELS: Record<JobType, string> = {
  FULL_TIME: 'تمام‌وقت',
  REMOTE: 'دورکاری',
  PART_TIME: 'پاره‌وقت',
};

const JOB_TYPE_BADGE: Record<JobType, string> = {
  FULL_TIME: 'bg-[rgba(52,211,153,.14)] text-[#34d399]',
  REMOTE: 'bg-[rgba(59,130,246,.16)] text-[#60a5fa]',
  PART_TIME: 'bg-[rgba(245,158,11,.14)] text-[#fbbf24]',
};

const STATUS_META: Record<JobApplicationStatus, { label: string; className: string }> = {
  SUBMITTED: { label: 'در انتظار بررسی', className: 'bg-[rgba(245,158,11,.14)] text-[#f59e0b]' },
  REFERRED: { label: 'ارجاع‌شده', className: 'bg-[rgba(168,85,247,.16)] text-[#c084fc]' },
  HIRED: { label: 'استخدام شد', className: 'bg-[rgba(52,211,153,.14)] text-[#34d399]' },
  REJECTED: { label: 'رد شد', className: 'bg-[rgba(248,113,113,.14)] text-[#f87171]' },
};

type TabKey = 'create' | 'ads' | 'applications';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'create', label: 'ایجاد فرصت شغلی' },
  { key: 'ads', label: 'آگهی‌ها' },
  { key: 'applications', label: 'درخواست‌های استخدام' },
];

const emptyForm: CreateJobPostingInput = {
  title: '',
  dept: '',
  city: '',
  type: 'FULL_TIME',
  description: '',
  generalReqs: [],
  specialReqs: [],
  imageFileId: null,
};

const inputClass =
  'h-10 w-full rounded-[11px] border border-[#28344c] bg-[#0f1623] px-3 text-xs text-[#e7ecf3] outline-none placeholder:text-[#6b7b94] focus:border-[#3b82f6]';

/**
 * SITE_ADMIN «درخواست‌های استخدام» panel — three sections:
 * create posting (image + text), ads list + footer visibility, applications/forms.
 */
export default function CareersAdminPage() {
  const [tab, setTab] = useState<TabKey>('ads');

  const [postings, setPostings] = useState<JobPosting[] | null>(null);
  const [footerEnabled, setFooterEnabled] = useState(false);
  const [editing, setEditing] = useState<JobPosting | null>(null);
  const [form, setForm] = useState<CreateJobPostingInput>(emptyForm);
  const [generalReqsText, setGeneralReqsText] = useState('');
  const [specialReqsText, setSpecialReqsText] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [saving, setSaving] = useState(false);

  const [applications, setApplications] = useState<JobApplicationRow[] | null>(null);
  const [q, setQ] = useState('');
  const [jobFilter, setJobFilter] = useState('');
  const [detail, setDetail] = useState<JobApplicationDetail | null>(null);
  const [assigneePick, setAssigneePick] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadPostings = useCallback(async () => {
    try {
      const [rows, settings] = await Promise.all([fetchAllPostings(), fetchCareersSettings()]);
      setPostings(rows);
      setFooterEnabled(settings.enabled);
    } catch {
      setError('خطا در دریافت فرصت‌های شغلی.');
    }
  }, []);

  const loadApplications = useCallback(async (query?: string, jobTitle?: string) => {
    try {
      setApplications(
        await fetchApplications({
          ...(query ? { q: query } : {}),
          ...(jobTitle ? { jobTitle } : {}),
        }),
      );
    } catch {
      setError('خطا در دریافت درخواست‌های استخدام.');
    }
  }, []);

  useEffect(() => {
    void loadPostings();
    void loadApplications();
  }, [loadPostings, loadApplications]);

  function resetForm() {
    setEditing(null);
    setForm(emptyForm);
    setGeneralReqsText('');
    setSpecialReqsText('');
    setImagePreview(null);
  }

  function openCreateTab() {
    resetForm();
    setTab('create');
  }

  function openEdit(p: JobPosting) {
    setEditing(p);
    setForm({
      title: p.title,
      dept: p.dept,
      city: p.city,
      type: p.type,
      description: p.description,
      generalReqs: p.generalReqs ?? [],
      specialReqs: p.specialReqs ?? [],
      imageFileId: p.imageFileId,
    });
    setGeneralReqsText((p.generalReqs ?? []).join('\n'));
    setSpecialReqsText((p.specialReqs ?? []).join('\n'));
    setImagePreview(jobPostingImageUrl(p.imageUrl, p.imageFileId));
    setTab('create');
  }

  async function onRemoveImage() {
    const fileId = form.imageFileId;
    setForm((f) => ({ ...f, imageFileId: null }));
    setImagePreview(null);
    if (fileId) {
      try {
        await deleteFile(fileId);
      } catch {
        // 404 on repeat delete is fine — local form already cleared.
      }
    }
  }

  async function onPickImage(file: File | null) {
    if (!file) return;
    setUploadingImage(true);
    setError(null);
    try {
      const uploaded = await uploadFile(file);
      setForm((f) => ({ ...f, imageFileId: uploaded.id }));
      setImagePreview(URL.createObjectURL(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در آپلود تصویر آگهی.');
    } finally {
      setUploadingImage(false);
    }
  }

  async function onSaveForm() {
    setSaving(true);
    setError(null);
    const generalReqs = generalReqsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const specialReqs = specialReqsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const payload: CreateJobPostingInput = {
      ...form,
      description: form.description?.trim() ?? '',
      generalReqs,
      specialReqs,
      imageFileId: form.imageFileId ?? null,
    };
    try {
      if (editing) await updatePosting(editing.id, payload);
      else await createPosting(payload);
      setNotice(editing ? 'آگهی به‌روزرسانی شد ✓' : 'فرصت شغلی ایجاد شد ✓');
      resetForm();
      await loadPostings();
      setTab('ads');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در ذخیره فرصت شغلی.');
    } finally {
      setSaving(false);
    }
  }

  async function onToggleActive(p: JobPosting) {
    try {
      await updatePosting(p.id, { active: !p.active });
      await loadPostings();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در تغییر وضعیت آگهی.');
    }
  }

  async function onToggleFooter() {
    try {
      const next = await updateCareersSettings(!footerEnabled);
      setFooterEnabled(next.enabled);
      setNotice(
        next.enabled
          ? 'لینک فرصت‌های شغلی در فوتر فعال شد ✓'
          : 'لینک فرصت‌های شغلی در فوتر غیرفعال شد.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در تغییر نمایش فوتر.');
    }
  }

  async function openDetail(id: string) {
    setError(null);
    setAssigneePick('');
    try {
      setDetail(await fetchApplicationDetail(id));
    } catch {
      setError('خطا در دریافت جزئیات درخواست.');
    }
  }

  async function onRefer() {
    if (!detail || !assigneePick) return;
    try {
      await referApplication(detail.id, assigneePick);
      const target = detail.referralTargets.find((r) => r.id === assigneePick);
      setNotice(`درخواست به ${target?.labelFa ?? ''} ارجاع شد ✓`);
      setDetail(await fetchApplicationDetail(detail.id));
      await loadApplications(q || undefined, jobFilter || undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در ثبت ارجاع.');
    }
  }

  async function onHire() {
    if (!detail) return;
    try {
      await hireApplication(detail.id);
      setDetail(await fetchApplicationDetail(detail.id));
      await loadApplications(q || undefined, jobFilter || undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در ثبت استخدام.');
    }
  }

  async function onReject() {
    if (!detail) return;
    try {
      await rejectApplication(detail.id);
      setDetail(await fetchApplicationDetail(detail.id));
      await loadApplications(q || undefined, jobFilter || undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در ثبت رد درخواست.');
    }
  }

  async function onDownloadResume(id: string, fileName: string | null) {
    try {
      const blob = await fetchApplicationResume(id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName ?? 'resume.pdf';
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در دریافت رزومه.');
    }
  }

  const postingRows = postings ?? [];
  const applicationRows = applications ?? [];
  const adsPager = usePagination(postingRows);
  const appsPager = usePagination(applicationRows);

  useEffect(() => {
    appsPager.setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, jobFilter, applications]);

  const jobOptions = useMemo(() => {
    const titles = new Set<string>();
    for (const p of postingRows) titles.add(p.title);
    for (const a of applicationRows) titles.add(a.jobTitle);
    return Array.from(titles).sort((a, b) => a.localeCompare(b, 'fa'));
  }, [postingRows, applicationRows]);

  return (
    <div className="flex flex-col gap-[15px] px-[21px] pb-[34px] pt-[18px]">
      <div>
        <h1 className="m-0 text-[20.5px] font-black text-white">استخدام</h1>
        <p className="mt-1 text-[11.5px] text-[#6b7b94]">
          ایجاد آگهی، مدیریت فرصت‌های شغلی و بررسی فرم‌های ارسالی متقاضیان
        </p>
      </div>

      <div className="flex flex-wrap gap-[3px] rounded-[11px] border border-[#1f2a3d] bg-[#0f1623] p-[3px]">
        {TABS.map((t) => {
          const on = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                if (t.key === 'create' && !editing) resetForm();
                setTab(t.key);
              }}
              className={`rounded-lg px-[14px] py-2 text-[11.5px] transition ${
                on ? 'bg-[#3b82f6] font-bold text-white' : 'font-semibold text-[#6b7b94] hover:text-[#e7ecf3]'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {error && (
        <p className="rounded-lg bg-[rgba(248,113,113,.12)] p-3 text-sm text-[#f87171]">{error}</p>
      )}
      {notice && (
        <p className="rounded-lg bg-[rgba(52,211,153,.12)] p-3 text-sm text-[#34d399]">{notice}</p>
      )}

      {tab === 'create' && (
        <section className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-[15px]">
          <h2 className="m-0 text-[14.5px] font-extrabold text-white">
            {editing ? 'ویرایش فرصت شغلی' : 'ایجاد فرصت شغلی'}
          </h2>
          <p className="mt-1 text-[11px] text-[#6b7b94]">عکس آگهی + متن توضیحی و مشخصات شغل</p>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.2fr]">
            <div>
              <div className="mb-1 text-[11px] font-bold text-[#e7ecf3]">تصویر آگهی</div>
              <label className="flex h-[180px] cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-[12px] border border-dashed border-[#28344c] bg-[#0f1623]">
                {imagePreview ? (
                  <img src={imagePreview} alt="" className="h-full w-full object-cover" />
                ) : (
                  <>
                    <span className="text-[11.5px] font-bold text-[#9fb0c7]">
                      {uploadingImage ? 'در حال آپلود…' : 'افزودن تصویر'}
                    </span>
                    <span className="text-[10px] text-[#6b7b94]">JPG یا PNG تا ۵ مگابایت</span>
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploadingImage}
                  onChange={(e) => void onPickImage(e.target.files?.[0] ?? null)}
                />
              </label>
              {imagePreview && (
                <button
                  type="button"
                  data-testid="careers-remove-image"
                  onClick={() => void onRemoveImage()}
                  className="mt-2 text-[11px] font-bold text-[#f87171]"
                >
                  حذف تصویر
                </button>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="عنوان شغل *"
                className={inputClass}
              />
              <div className="grid grid-cols-2 gap-2.5">
                <input
                  value={form.dept}
                  onChange={(e) => setForm({ ...form, dept: e.target.value })}
                  placeholder="واحد *"
                  className={inputClass}
                />
                <input
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  placeholder="شهر *"
                  className={inputClass}
                />
              </div>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as JobType })}
                className={inputClass}
              >
                <option value="FULL_TIME">تمام‌وقت</option>
                <option value="REMOTE">دورکاری</option>
                <option value="PART_TIME">پاره‌وقت</option>
              </select>
              <textarea
                value={form.description ?? ''}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="متن توضیحی آگهی…"
                rows={4}
                className="w-full rounded-[11px] border border-[#28344c] bg-[#0f1623] p-3 text-xs text-[#e7ecf3] outline-none placeholder:text-[#6b7b94] focus:border-[#3b82f6]"
              />
              <textarea
                value={generalReqsText}
                onChange={(e) => setGeneralReqsText(e.target.value)}
                placeholder="شرایط عمومی (هر مورد در یک خط)"
                rows={2}
                className="w-full rounded-[11px] border border-[#28344c] bg-[#0f1623] p-3 text-xs text-[#e7ecf3] outline-none placeholder:text-[#6b7b94] focus:border-[#3b82f6]"
              />
              <textarea
                value={specialReqsText}
                onChange={(e) => setSpecialReqsText(e.target.value)}
                placeholder="شرایط تخصصی (هر مورد در یک خط)"
                rows={2}
                className="w-full rounded-[11px] border border-[#28344c] bg-[#0f1623] p-3 text-xs text-[#e7ecf3] outline-none placeholder:text-[#6b7b94] focus:border-[#3b82f6]"
              />
              <div className="flex gap-2">
                {editing && (
                  <button
                    type="button"
                    onClick={() => {
                      resetForm();
                      setTab('ads');
                    }}
                    className="rounded-[10px] border border-[#28344c] bg-[#18223a] px-4 py-2.5 text-xs font-bold text-[#9fb0c7]"
                  >
                    انصراف
                  </button>
                )}
                <button
                  type="button"
                  disabled={
                    saving || !form.title.trim() || !form.dept.trim() || !form.city.trim()
                  }
                  onClick={() => void onSaveForm()}
                  className="flex-1 rounded-[10px] bg-[#3b82f6] py-2.5 text-xs font-extrabold text-white disabled:opacity-50"
                >
                  {saving ? 'در حال ذخیره…' : editing ? 'ذخیره تغییرات' : 'ثبت فرصت شغلی'}
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {tab === 'ads' && (
        <section className="rounded-[14px] border border-[#1f2a3d] bg-[#141d2e] p-[15px]">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="m-0 text-[14.5px] font-extrabold text-white">آگهی‌های استخدام</h2>
              <p className="mt-1 flex items-center gap-1.5 text-[11px] text-[#6b7b94]">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${footerEnabled ? 'bg-[#34d399]' : 'bg-[#6b7280]'}`}
                />
                {footerEnabled
                  ? 'لینک «فرصت‌های شغلی» در بخش خدمات فوتر فعال است'
                  : 'لینک «فرصت‌های شغلی» در فوتر غیرفعال است'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                role="switch"
                aria-checked={footerEnabled}
                aria-label="نمایش لینک فرصت‌های شغلی در فوتر"
                onClick={() => void onToggleFooter()}
                className={`inline-flex items-center gap-2 rounded-[10px] border px-3 py-2 text-[11.5px] font-bold transition ${
                  footerEnabled
                    ? 'border-[#34d399]/40 bg-[rgba(52,211,153,.12)] text-[#34d399]'
                    : 'border-[#28344c] bg-[#18223a] text-[#9fb0c7]'
                }`}
              >
                <span
                  className={`relative h-5 w-9 rounded-full ${footerEnabled ? 'bg-[#34d399]' : 'bg-[#28344c]'}`}
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${
                      footerEnabled ? 'right-0.5' : 'right-[18px]'
                    }`}
                  />
                </span>
                نمایش لینک در فوتر
              </button>
              <button
                type="button"
                onClick={openCreateTab}
                className="rounded-[10px] bg-[#3b82f6] px-3 py-2 text-[11.5px] font-bold text-white"
              >
                + ایجاد فرصت شغلی
              </button>
            </div>
          </div>

          {postings === null ? (
            <p className="py-8 text-center text-sm text-[#6b7b94]">در حال بارگذاری…</p>
          ) : postingRows.length === 0 ? (
            <p className="py-8 text-center text-xs text-[#6b7b94]">هنوز آگهی‌ای ثبت نشده است.</p>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {adsPager.pageItems.map((p) => {
                  const img = jobPostingImageUrl(p.imageUrl, p.imageFileId);
                  return (
                    <div
                      key={p.id}
                      className="overflow-hidden rounded-xl border border-[#28344c] bg-[#18223a]"
                    >
                      <div className="flex h-[110px] items-center justify-center overflow-hidden bg-[#eef3fa]">
                        {img ? (
                          <img src={img} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-[10px] text-[#4a5a73]">بدون تصویر</span>
                        )}
                      </div>
                      <div className="p-3">
                        <div className="text-[13px] font-bold text-[#e7ecf3]">{p.title}</div>
                        <div className="mt-1 text-[11px] text-[#6b7b94]">
                          {p.dept} · {p.city}
                        </div>
                        {p.description ? (
                          <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-[#9fb0c7]">
                            {p.description}
                          </p>
                        ) : null}
                        <div className="mt-2.5 flex items-center justify-between gap-2">
                          <span
                            className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${JOB_TYPE_BADGE[p.type]}`}
                          >
                            {JOB_TYPE_LABELS[p.type]}
                          </span>
                          <button
                            type="button"
                            onClick={() => openEdit(p)}
                            className="text-[11.5px] font-bold text-[#60a5fa]"
                          >
                            ویرایش
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => void onToggleActive(p)}
                          className="mt-3 w-full rounded-[9px] border border-[#f87171]/35 py-2 text-[11px] font-bold text-[#f87171]"
                        >
                          {p.active ? 'غیرفعال کردن آگهی' : 'فعال کردن آگهی'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <Pagination
                page={adsPager.page}
                totalPages={adsPager.totalPages}
                onChange={adsPager.setPage}
                variant="dark"
              />
            </>
          )}
        </section>
      )}

      {tab === 'applications' && (
        <section className="overflow-hidden rounded-[14px] border border-[#1f2a3d] bg-[#141d2e]">
          <div className="border-b border-[#1f2a3d] px-[15px] py-[14px]">
            <h2 className="m-0 text-[14.5px] font-extrabold text-white">
              درخواست‌های استخدام
            </h2>
            <p className="mt-1 text-[11px] text-[#6b7b94]">
              فرم‌ها و اسناد آپلودشده توسط متقاضیان در صفحه استخدام
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) =>
                  e.key === 'Enter' &&
                  void loadApplications(q.trim() || undefined, jobFilter || undefined)
                }
                placeholder="جستجو در نام، کد ملی، تلفن یا ایمیل…"
                className="h-10 min-w-[220px] flex-1 rounded-[10px] border border-[#28344c] bg-[#18223a] px-3 text-[11.5px] text-[#e7ecf3] outline-none placeholder:text-[#6b7b94] focus:border-[#3b82f6]"
              />
              <select
                aria-label="فیلتر آگهی"
                value={jobFilter}
                onChange={(e) => {
                  setJobFilter(e.target.value);
                  void loadApplications(q.trim() || undefined, e.target.value || undefined);
                }}
                className="h-10 rounded-[10px] border border-[#28344c] bg-[#18223a] px-3 text-[11.5px] text-[#e7ecf3] outline-none"
              >
                <option value="">همۀ آگهی‌ها</option>
                {jobOptions.map((title) => (
                  <option key={title} value={title}>
                    {title}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void loadApplications(q.trim() || undefined, jobFilter || undefined)}
                className="rounded-[10px] bg-[#3b82f6] px-3 py-2 text-[11.5px] font-bold text-white"
              >
                جستجو
              </button>
            </div>
          </div>

          {applications === null ? (
            <p className="py-10 text-center text-sm text-[#6b7b94]">در حال بارگذاری…</p>
          ) : applicationRows.length === 0 ? (
            <p className="py-[40px] text-center text-xs text-[#6b7b94]">
              هنوز فرمی از صفحات استخدام ثبت نشده است.
            </p>
          ) : (
            <>
              <ul className="divide-y divide-[#1a2436]">
                {appsPager.pageItems.map((a) => {
                  const st = STATUS_META[a.status];
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => void openDetail(a.id)}
                        className="flex w-full flex-wrap items-center gap-3 px-[15px] py-3.5 text-start transition hover:bg-[rgba(59,130,246,.06)]"
                      >
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[rgba(59,130,246,.16)] text-sm font-black text-[#60a5fa]">
                          {a.name.slice(0, 1)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[12.5px] font-bold text-[#e7ecf3]">{a.name}</span>
                          <span className="mt-0.5 block text-[11px] text-[#6b7b94]">
                            {a.jobTitle}
                            {a.hasResume ? ' · دارای رزومه' : ''}
                            {a.assigneeLabelFa ? ` · ارجاع به: ${a.assigneeLabelFa}` : ''}
                          </span>
                        </span>
                        <div className="text-left">
                          <div className="text-[10px] text-[#6b7b94]">تاریخ ثبت</div>
                          <div className="font-num text-xs font-bold text-[#e7ecf3]">
                            {formatJalaliDateTime(a.at)}
                          </div>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-[10px] font-bold ${st.className}`}>
                          {st.label}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="px-[15px] pb-4 pt-2">
                <Pagination
                  page={appsPager.page}
                  totalPages={appsPager.totalPages}
                  onChange={appsPager.setPage}
                  variant="dark"
                />
              </div>
            </>
          )}
        </section>
      )}

      {detail && (
        <Modal
          variant="dark"
          title={`فرم استخدام · ${detail.name}`}
          onClose={() => setDetail(null)}
          maxWidthClass="max-w-2xl"
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[11px] text-[#6b7b94]">وضعیت</span>
            <span
              className={`rounded-full px-3 py-1 text-[10px] font-bold ${STATUS_META[detail.status].className}`}
            >
              {STATUS_META[detail.status].label}
            </span>
          </div>

          <div className="mb-3 rounded-xl border border-[#22304a] bg-[#0f1726] p-3">
            <h3 className="mb-2 text-xs font-extrabold text-[#8fa1bb]">اطلاعات فرم متقاضی</h3>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
              <div>
                <dt className="text-[#6b7b94]">شغل مورد نظر</dt>
                <dd className="font-bold text-[#e7ecf3]">{detail.jobTitle}</dd>
              </div>
              <div>
                <dt className="text-[#6b7b94]">کد ملی</dt>
                <dd className="ltr font-num font-bold text-[#e7ecf3]">{faDigits(detail.nationalId)}</dd>
              </div>
              <div>
                <dt className="text-[#6b7b94]">تلفن</dt>
                <dd className="ltr font-num font-bold text-[#e7ecf3]">{faDigits(detail.phone)}</dd>
              </div>
              <div>
                <dt className="text-[#6b7b94]">ایمیل</dt>
                <dd className="ltr font-bold text-[#e7ecf3]">{detail.email ?? '—'}</dd>
              </div>
              {detail.fatherName && (
                <div>
                  <dt className="text-[#6b7b94]">نام پدر</dt>
                  <dd className="font-bold text-[#e7ecf3]">{detail.fatherName}</dd>
                </div>
              )}
              {detail.residenceAddress && (
                <div className="col-span-2">
                  <dt className="text-[#6b7b94]">آدرس</dt>
                  <dd className="text-[#e7ecf3]">{detail.residenceAddress}</dd>
                </div>
              )}
              {detail.skills && (
                <div className="col-span-2">
                  <dt className="text-[#6b7b94]">مهارت‌ها</dt>
                  <dd className="text-[#e7ecf3]">{detail.skills}</dd>
                </div>
              )}
            </dl>
          </div>

          <div className="mb-3 rounded-xl border border-[#22304a] bg-[#0f1726] p-3">
            <h3 className="mb-2 text-xs font-extrabold text-[#8fa1bb]">اسناد آپلودشده</h3>
            {detail.hasResume ? (
              <button
                type="button"
                onClick={() => void onDownloadResume(detail.id, detail.resumeFileName)}
                className="inline-flex items-center gap-2 rounded-[10px] border border-[#28344c] bg-[#18223a] px-3 py-2 text-[11.5px] font-bold text-[#60a5fa]"
              >
                📄 دانلود رزومه ({detail.resumeFileName ?? 'resume.pdf'})
              </button>
            ) : (
              <p className="text-[11px] text-[#6b7b94]">سندی آپلود نشده است.</p>
            )}
          </div>

          {(detail.eduEntries.length > 0 ||
            detail.workEntries.length > 0 ||
            detail.langEntries.length > 0) && (
            <div className="mb-3 rounded-xl border border-[#22304a] bg-[#0f1726] p-3">
              <h3 className="mb-2 text-xs font-extrabold text-[#8fa1bb]">سوابق فرم</h3>
              {detail.eduEntries.length > 0 && (
                <div className="mb-2 text-[11px] text-[#9fb0c7]">
                  تحصیلات: {faDigits(detail.eduEntries.length)} مورد
                </div>
              )}
              {detail.workEntries.length > 0 && (
                <div className="mb-2 text-[11px] text-[#9fb0c7]">
                  سابقه کار: {faDigits(detail.workEntries.length)} مورد
                </div>
              )}
              {detail.langEntries.length > 0 && (
                <div className="text-[11px] text-[#9fb0c7]">
                  زبان‌ها: {faDigits(detail.langEntries.length)} مورد
                </div>
              )}
            </div>
          )}

          {detail.canAct && (
            <div className="mb-3 rounded-xl border border-[#22304a] bg-[#0f1726] p-3">
              <h3 className="mb-2 text-xs font-extrabold text-[#8fa1bb]">ارجاع به مدیران</h3>
              <div className="flex gap-2">
                <select
                  aria-label="گیرنده ارجاع"
                  value={assigneePick}
                  onChange={(e) => setAssigneePick(e.target.value)}
                  className="h-9 flex-1 rounded-lg border border-[#28344c] bg-[#18223a] px-2 text-xs text-[#e7ecf3] outline-none"
                >
                  <option value="">— انتخاب مدیر —</option>
                  {detail.referralTargets.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.labelFa}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void onRefer()}
                  disabled={!assigneePick}
                  className="rounded-lg bg-[#3b82f6] px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                >
                  ثبت ارجاع
                </button>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => void onHire()}
                  className="flex-1 rounded-lg bg-[rgba(52,211,153,.14)] px-3 py-2 text-xs font-bold text-[#34d399]"
                >
                  استخدام
                </button>
                <button
                  type="button"
                  onClick={() => void onReject()}
                  className="flex-1 rounded-lg bg-[rgba(248,113,113,.14)] px-3 py-2 text-xs font-bold text-[#f87171]"
                >
                  رد درخواست
                </button>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-[#22304a] bg-[#0f1726] p-3">
            <h3 className="mb-2 text-xs font-extrabold text-[#8fa1bb]">روند بررسی</h3>
            <ul className="flex flex-col gap-2 text-[11px] text-[#6b7b94]">
              {detail.history.map((h, i) => (
                <li key={i}>
                  {h.label} — <span className="font-num">{formatJalaliDateTime(h.at)}</span>
                </li>
              ))}
            </ul>
          </div>
        </Modal>
      )}
    </div>
  );
}
