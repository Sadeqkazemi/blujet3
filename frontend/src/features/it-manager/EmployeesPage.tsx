import { useCallback, useEffect, useState } from 'react';
import {
  createEmployee,
  fetchEmployee,
  fetchEmployees,
  fetchPermissionCatalog,
  removeEmployee,
  resetEmployeePassword,
  setEmployeePermission,
  setEmployeeStatus,
} from '../../api/it-manager';
import { faDigits, isValidIranMobile, normalizeIranMobile } from '../../lib/fa-format';
import { formatJalaliDateTime } from '../../lib/jalali';
import Modal from '../../components/Modal';
import Pagination from '../../components/Pagination';
import { usePagination } from '../../hooks/usePagination';
import { useOptionalAuth } from '../../hooks/useAuth';
import type { EmployeeDetail, EmployeeListRow, PermissionCatalog } from '../../types/it-manager';
import { togglePermissionSelection } from './employee-permission-dependencies';

const DEPT_OPTIONS = [
  { value: 'commercial', label: 'واحد بازرگانی', manager: 'مدیر بازرگانی', color: '#38bdf8' },
  { value: 'sales', label: 'واحد فروش', manager: 'مدیر بازرگانی', color: '#4ade80' },
  { value: 'finance', label: 'واحد مالی', manager: 'مدیر مالی', color: '#3b82f6' },
  { value: 'it', label: 'واحد IT', manager: 'مدیر IT', color: '#8b5cf6' },
];

const DEPT_LABELS: Record<string, string> = {
  commercial: 'واحد بازرگانی',
  sales: 'واحد فروش',
  finance: 'واحد مالی',
  it: 'واحد IT',
};

const RANK_OPTIONS = ['کارآموز', 'کارشناس', 'کارشناس ارشد', 'سرپرست واحد', 'معاون'];

const ACCESS_MATRIX = [
  { role: 'مدیر مالی', sub: 'تحت مدیریت IT', color: '#6ee7b7', access: [true, true, false, false, false] },
  { role: 'مدیر بازرگانی', sub: 'تحت مدیریت IT', color: '#6ee7b7', access: [true, true, true, false, false] },
  { role: 'ادمین سایت', sub: 'تحت مدیریت IT', color: '#6ee7b7', access: [true, false, true, true, false] },
  { role: 'آژانس', sub: 'تحت مدیریت IT', color: '#6ee7b7', access: [true, true, false, false, true] },
  { role: 'مدیر ارشد', sub: 'فقط رئیس هیئت مدیره', color: '#f59e0b', access: [true, true, false, true, false] },
  { role: 'رئیس هیئت مدیره', sub: 'بالاترین سطح', color: '#f87171', access: [true, true, false, true, false] },
] as const;

const ACCESS_COLUMNS = ['داشبورد', 'مالی', 'محتوا', 'کاربران', 'تنظیمات'] as const;

const IT_SCOPE_ITEMS = [
  ['مدیریت کاربران و حساب‌ها', true],
  ['بازنشانی و مدیریت رمز عبور', true],
  ['تعیین دسترسی نقش‌ها', true],
  ['دسترسی به پنل مدیر ارشد', false],
  ['دسترسی به پنل رئیس هیئت مدیره', false],
] as const;

function deptRoleLabel(
  dept: string | null,
  rank: string | null,
  customLabels: Record<string, string>,
) {
  let d = '—';
  if (dept) {
    d = DEPT_LABELS[dept] ?? customLabels[dept] ?? (dept.startsWith('custom_') ? 'واحد سفارشی' : dept);
  }
  return `${rank ?? 'کارشناس'} · ${d}`;
}

export default function EmployeesPage() {
  const user = useOptionalAuth()?.user;
  const canManageAccess = user?.role !== 'EMPLOYEE';
  const [employees, setEmployees] = useState<EmployeeListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [catalog, setCatalog] = useState<PermissionCatalog | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [form, setForm] = useState({
    fullName: '',
    username: '',
    phone: '',
    password: '',
    dept: 'commercial',
    rank: 'کارشناس',
    referralScope: 'MANAGERS_ONLY' as 'MANAGERS_ONLY' | 'ALL_STAFF',
  });
  const [selectedPerms, setSelectedPerms] = useState<Set<string>>(new Set());
  const [customDeptLabels, setCustomDeptLabels] = useState<Record<string, string>>({});
  const [customDepts, setCustomDepts] = useState<{ id: string; label: string }[]>([]);
  const [addingDept, setAddingDept] = useState(false);
  const [newDeptName, setNewDeptName] = useState('');
  const [statusConfirm, setStatusConfirm] = useState<EmployeeListRow | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<EmployeeListRow | null>(null);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<EmployeeDetail | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [createdCredentials, setCreatedCredentials] = useState<{
    fullName: string;
    username: string;
    phone: string;
    password: string;
  } | null>(null);

  const employeesPager = usePagination(employees);

  const load = useCallback(async () => {
    try {
      setEmployees(await fetchEmployees());
    } catch {
      setError('خطا در دریافت فهرست کارمندان.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    fetchPermissionCatalog()
      .then(setCatalog)
      .catch(() => undefined);
  }, [load]);

  useEffect(() => {
    if (!detailId) {
      setDetail(null);
      setTempPassword(null);
      return;
    }
    fetchEmployee(detailId)
      .then(setDetail)
      .catch(() => setError('خطا در دریافت جزئیات کارمند.'));
  }, [detailId]);

  async function onCreate() {
    if (!form.fullName.trim() || !form.username.trim()) {
      setAddError('نام و نام کاربری الزامی است.');
      return;
    }
    const phone = normalizeIranMobile(form.phone);
    if (!isValidIranMobile(phone)) {
      setAddError('شماره موبایل معتبر وارد کنید (مثال: ۰۹۱۲۱۲۳۴۵۶۷).');
      return;
    }
    if (form.password.length < 6) {
      setAddError('رمز عبور باید حداقل ۶ کاراکتر باشد.');
      return;
    }
    if (catalogGroups.length > 0 && selectedPerms.size === 0) {
      setAddError('حداقل یک دسترسی از دسترسی‌های واحد را انتخاب کنید.');
      return;
    }
    try {
      const submitted = {
        fullName: form.fullName.trim(),
        username: form.username.trim(),
        phone,
        password: form.password,
      };
      await createEmployee({
        fullName: submitted.fullName,
        username: submitted.username,
        phone: submitted.phone,
        password: submitted.password,
        dept: form.dept,
        rank: form.rank,
        referralScope: form.referralScope,
        permissionKeys: Array.from(selectedPerms),
      });
      setNotice(`کارمند «${submitted.fullName}» ایجاد شد ✓`);
      setAddOpen(false);
      setCreatedCredentials(submitted);
      setForm({
        fullName: '',
        username: '',
        phone: '',
        password: '',
        dept: 'commercial',
        rank: 'کارشناس',
        referralScope: 'MANAGERS_ONLY',
      });
      setSelectedPerms(new Set());
      setAddingDept(false);
      setNewDeptName('');
      await load();
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'خطا در ایجاد کارمند.');
    }
  }

  function requestStatusChange(row: EmployeeListRow) {
    if (row.isActive) {
      setStatusConfirm(row);
      return;
    }
    void onToggleStatus(row);
  }

  async function onToggleStatus(row: EmployeeListRow) {
    try {
      await setEmployeeStatus(row.id, !row.isActive);
      await load();
    } catch {
      setError('خطا در تغییر وضعیت حساب.');
    }
  }

  async function onQuickReset(row: EmployeeListRow) {
    try {
      const { tempPassword: pw } = await resetEmployeePassword(row.id);
      setNotice(`رمز موقت «${row.fullName}»: ${pw}`);
    } catch {
      setError('خطا در بازنشانی رمز عبور.');
    }
  }

  async function onGrant(key: string, grant: boolean) {
    if (!detailId) return;
    try {
      const updated = await setEmployeePermission(detailId, key, grant);
      setDetail(updated);
    } catch {
      setError('خطا در تغییر دسترسی.');
    }
  }

  async function onResetPassword() {
    if (!detailId) return;
    try {
      const { tempPassword: pw } = await resetEmployeePassword(detailId);
      setTempPassword(pw);
    } catch {
      setError('خطا در بازنشانی رمز عبور.');
    }
  }

  async function confirmSuspend() {
    if (!statusConfirm) return;
    await onToggleStatus(statusConfirm);
    setStatusConfirm(null);
  }

  async function confirmDelete() {
    if (!deleteConfirm) return;
    try {
      await removeEmployee(deleteConfirm.id);
      if (detailId === deleteConfirm.id) setDetailId(null);
      setNotice(`حساب «${deleteConfirm.fullName}» حذف و بایگانی شد.`);
      setDeleteConfirm(null);
      await load();
    } catch {
      setError('خطا در حذف حساب کارمند.');
    }
  }

  function submitNewDept() {
    const name = newDeptName.trim();
    if (!name) return;
    const id = `custom_${Date.now()}`;
    setCustomDepts((prev) => [...prev, { id, label: name }]);
    setCustomDeptLabels((prev) => ({ ...prev, [id]: name }));
    selectDept(id);
    setAddingDept(false);
    setNewDeptName('');
    setNotice(`واحد سازمانی «${name}» ایجاد شد ✓`);
  }

  function selectDept(dept: string) {
    setForm((current) => ({ ...current, dept }));
    // Permission keys are unit-scoped. Carrying selections between units
    // would either grant the wrong manager surface or be rejected by the API.
    setSelectedPerms(new Set());
  }

  const catalogDeptKey = form.dept.startsWith('custom_')
    ? null
    : form.dept === 'sales'
      ? 'commercial'
      : form.dept;
  const catalogGroups = catalogDeptKey ? (catalog?.[catalogDeptKey] ?? []) : [];

  return (
    <div className="flex flex-col px-[21px] pb-[34px] pt-[18px]">
      <div className="order-1 mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20.5px] font-black text-white">کاربران و حساب‌های سامانه</h1>
          <p className="mt-1 text-[11.5px] text-[#6b7b94]">
            مدیریت یوزرها، نقش‌ها و بازنشانی رمز عبور — همه حساب‌ها زیر نظر واحد IT
          </p>
        </div>
        {canManageAccess && <button
          onClick={() => {
            setAddError(null);
            setAddOpen(true);
          }}
          className="rounded-lg bg-[#3b82f6] px-4 py-2 text-xs font-bold text-white transition hover:brightness-110"
        >
          افزودن کاربر
        </button>}
      </div>

      {error && <p className="order-2 mb-4 rounded-lg bg-[rgba(248,113,113,.12)] p-3 text-sm text-[#f87171]">{error}</p>}
      {notice && <p className="order-2 mb-4 rounded-lg bg-[rgba(16,185,129,.12)] p-3 text-sm text-[#34d399]">{notice}</p>}

      <section className="order-4 mb-8 overflow-hidden rounded-xl border border-[#1f2a3d] bg-[#141d2e]">
        <div className="grid grid-cols-[1.6fr_1.3fr_1.4fr_1fr_0.9fr_1.4fr] gap-2 border-b border-[#1f2a3d] bg-[#18223a] px-4 py-2.5 text-[10.5px] font-bold text-[#6b7b94]">
          <span>کاربر</span>
          <span>نقش</span>
          <span>نام کاربری</span>
          <span>آخرین ورود</span>
          <span>وضعیت</span>
          <span>اقدامات</span>
        </div>
        {loading ? (
          <p className="py-6 text-center text-[11.5px] text-[#6b7b94]">در حال بارگذاری…</p>
        ) : employees.length === 0 ? (
          <p className="py-6 text-center text-xs text-[#6b7b94]">کارمندی ثبت نشده است.</p>
        ) : (
          <ul className="divide-y divide-[#1f2a3d]">
            {employeesPager.pageItems.map((e) => (
              <li
                key={e.id}
                className="grid grid-cols-[1.6fr_1.3fr_1.4fr_1fr_0.9fr_1.4fr] items-center gap-2 px-4 py-3 text-xs"
              >
                <button
                  onClick={() => setDetailId(e.id)}
                  className="text-right font-bold text-[#e7ecf3] underline decoration-dashed underline-offset-4"
                >
                  {e.fullName}
                </button>
                <span className="text-[#cdd6e3]">{deptRoleLabel(e.dept, e.rank, customDeptLabels)}</span>
                <span className="font-num ltr text-[#6b7b94]">{e.username}</span>
                <span className="font-num text-[#6b7b94]">
                  {e.lastLoginAt ? formatJalaliDateTime(e.lastLoginAt) : 'هنوز وارد نشده'}
                </span>
                <span
                  className={`w-fit rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                    e.isActive ? 'bg-[rgba(16,185,129,.14)] text-[#34d399]' : 'bg-[rgba(248,113,113,.14)] text-[#f87171]'
                  }`}
                >
                  {e.isActive ? 'فعال' : 'مسدود'}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setDetailId(e.id)}
                    className="rounded-lg border border-[#1f2a3d] bg-[#18223a] px-2 py-1 text-[10px] font-bold text-[#cdd6e3]"
                  >
                    جزئیات
                  </button>
                  <button
                    onClick={() => void onQuickReset(e)}
                    className="rounded-lg border border-[#1f2a3d] px-2 py-1 text-[10px] font-bold text-[#3b82f6]"
                  >
                    ریست رمز
                  </button>
                  {canManageAccess && <button
                    onClick={() => requestStatusChange(e)}
                    className={`rounded-lg border border-[#1f2a3d] px-2 py-1 text-[10px] font-bold ${
                      e.isActive ? 'text-[#f87171]' : 'text-[#34d399]'
                    }`}
                  >
                    {e.isActive ? 'تعلیق' : 'فعال‌سازی'}
                  </button>}
                  {canManageAccess && <button
                    onClick={() => setDeleteConfirm(e)}
                    className="rounded-lg border border-[#f87171]/40 px-2 py-1 text-[10px] font-bold text-[#f87171]"
                  >
                    حذف
                  </button>}
                </div>
              </li>
            ))}
          </ul>
        )}
        <Pagination
          page={employeesPager.page}
          totalPages={employeesPager.totalPages}
          onChange={employeesPager.setPage}
          variant="dark"
        />
      </section>

      <section className="order-5 mb-6">
        <div className="mb-3 flex items-start gap-2">
          <span className="mt-1 h-7 w-1 rounded-full bg-[#f59e0b]" />
          <div>
            <h2 className="text-[16px] font-black text-white">دسترسی و سطوح کارمندان</h2>
            <p className="mt-1 text-[11px] text-[#6b7b94]">تعیین سطح دسترسی کارمندان واحدها و مدیریت رمز عبور</p>
          </div>
        </div>
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-[#1f2a3d] bg-[#141d2e] p-4 text-[11.5px] leading-6 text-[#cdd6e3]">
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-[#f59e0b]/15 text-lg text-[#f59e0b]">▣</span>
          <p>
            واحد IT فقط دسترسی <strong className="text-white">کارمندان واحدها</strong> را تعیین می‌کند.
            دسترسی به پنل‌های مدیریتی توسط مدیر عامل و مدیر ارشد مدیریت می‌شود.
          </p>
        </div>
        <div className="overflow-x-auto rounded-xl border border-[#1f2a3d] bg-[#141d2e]">
          <div className="min-w-[720px]">
            <div className="grid grid-cols-[1.6fr_repeat(5,1fr)] border-b border-[#1f2a3d] bg-[#18223a] px-4 py-3 text-[10.5px] font-bold text-[#6b7b94]">
              <span>نقش</span>
              {ACCESS_COLUMNS.map((column) => <span key={column} className="text-center">{column}</span>)}
            </div>
            {ACCESS_MATRIX.map((row) => (
              <div key={row.role} className="grid grid-cols-[1.6fr_repeat(5,1fr)] items-center border-b border-[#1f2a3d] px-4 py-3 last:border-b-0">
                <div>
                  <div className="flex items-center gap-2 text-xs font-extrabold text-white">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: row.color }} />
                    {row.role}
                  </div>
                  <div className="mt-1 text-[9.5px] text-[#6b7b94]">{row.sub}</div>
                </div>
                {row.access.map((allowed, index) => (
                  <span key={`${row.role}-${ACCESS_COLUMNS[index]}`} className={`text-center text-lg font-bold ${allowed ? 'text-[#6ee7b7]' : 'text-[#526079]'}`}>
                    {allowed ? '✓' : '×'}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="order-6 mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-[#1f2a3d] bg-[#141d2e] p-5">
          <h3 className="mb-4 text-[14.5px] font-extrabold text-white">سطح دسترسی واحد IT</h3>
          <div className="divide-y divide-[#1f2a3d]">
            {IT_SCOPE_ITEMS.map(([label, allowed]) => (
              <div key={label} className="flex items-center justify-between gap-3 py-2.5 text-[11.5px]">
                <span className="text-[#cdd6e3]">{label}</span>
                <span className={`flex items-center gap-1.5 font-bold ${allowed ? 'text-[#6ee7b7]' : 'text-[#f87171]'}`}>
                  <span className={`flex h-6 w-6 items-center justify-center rounded-lg ${allowed ? 'bg-[#10b981]/15' : 'bg-[#f87171]/15'}`}>{allowed ? '✓' : '×'}</span>
                  {allowed ? 'مجاز' : 'غیرمجاز'}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-[#1f2a3d] bg-[#141d2e] p-5">
          <h3 className="mb-1 text-[14.5px] font-extrabold text-white">مدیریت رمز عبور کارمندان</h3>
          <p className="mb-4 text-[10.5px] leading-5 text-[#6b7b94]">فقط رمز عبور کارمندان واحدها قابل بازنشانی است؛ رمز مدیران در دسترس واحد IT نیست.</p>
          {employees.length === 0 ? (
            <p className="py-8 text-center text-xs text-[#6b7b94]">کارمندی ثبت نشده است.</p>
          ) : (
            <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
              {employees.map((employee) => (
                <div key={employee.id} className="flex items-center gap-2 rounded-lg border border-[#1f2a3d] p-2.5 text-xs">
                  <span className="flex-1 font-bold text-[#e7ecf3]">
                    {employee.fullName}{' '}
                    <span className="font-normal text-[#6b7b94]">· {DEPT_LABELS[employee.dept ?? ''] ?? employee.dept}</span>
                  </span>
                  <button onClick={() => void onQuickReset(employee)} className="rounded-lg border border-[#28344c] px-2.5 py-1 text-[10px] font-bold text-[#60a5fa]">
                    بازنشانی رمز
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {addOpen && (
        <section
          data-testid="inline-create-employee"
          className="order-3 mb-8 rounded-xl border border-dashed border-[#31405d] bg-[#141d2e] p-5"
        >
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-black text-white">ایجاد کارمند جدید</h2>
              <p className="mt-1 text-[10.5px] text-[#6b7b94]">اطلاعات حساب، واحد سازمانی و سطح دسترسی را یکجا ثبت کنید.</p>
            </div>
            <button type="button" onClick={() => setAddOpen(false)} className="text-[11px] font-bold text-[#9fb0c7]">بستن</button>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div>
          <label className="mb-1 block text-xs font-bold text-[#e7ecf3]" htmlFor="emp-name">
            نام و نام خانوادگی
          </label>
          <input
            id="emp-name"
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            className="w-full rounded-lg border border-[#1f2a3d] p-3 text-xs outline-none transition focus:border-[#3b82f6]"
          />
          </div>
          <div>
          <label className="mb-1 block text-xs font-bold text-[#e7ecf3]" htmlFor="emp-username">
            نام کاربری
          </label>
          <input
            id="emp-username"
            dir="ltr"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            className="font-num w-full rounded-lg border border-[#1f2a3d] p-3 text-xs outline-none transition focus:border-[#3b82f6]"
          />
          </div>
          <div>
          <label className="mb-1 block text-xs font-bold text-[#e7ecf3]" htmlFor="emp-position">
            سمت / نقش
          </label>
          <select
            id="emp-position"
            value={form.dept}
            onChange={(event) => selectDept(event.target.value)}
            className="w-full rounded-lg border border-[#1f2a3d] bg-[#101827] p-3 text-xs text-[#e7ecf3] outline-none transition focus:border-[#3b82f6]"
          >
            {DEPT_OPTIONS.map((dept) => (
              <option key={dept.value} value={dept.value}>کارشناس {dept.label.replace('واحد ', '')}</option>
            ))}
            {customDepts.map((dept) => <option key={dept.id} value={dept.id}>کارشناس {dept.label}</option>)}
          </select>
          </div>
          <div>
          <label className="mb-1 block text-xs font-bold text-[#e7ecf3]" htmlFor="emp-phone">
            شماره موبایل
          </label>
          <input
            id="emp-phone"
            dir="ltr"
            inputMode="numeric"
            autoComplete="tel"
            value={faDigits(form.phone)}
            onChange={(e) => setForm({ ...form, phone: normalizeIranMobile(e.target.value) })}
            placeholder="۰۹۱۲۱۲۳۴۵۶۷"
            className="font-num w-full rounded-lg border border-[#1f2a3d] p-3 text-xs outline-none transition focus:border-[#3b82f6]"
          />
          </div>
          <div>
          <label className="mb-1 block text-xs font-bold text-[#e7ecf3]" htmlFor="emp-password">
            رمز عبور اولیه
          </label>
          <input
            id="emp-password"
            dir="ltr"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="w-full rounded-lg border border-[#1f2a3d] p-3 text-xs outline-none transition focus:border-[#3b82f6]"
          />
          </div>
          </div>

          <div className="mb-1 mt-3 text-xs font-bold text-[#e7ecf3]">رتبه سازمانی</div>
          <div className="flex flex-wrap gap-1.5">
            {RANK_OPTIONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setForm({ ...form, rank: r })}
                className={`rounded-lg px-3 py-2 text-[11px] font-bold transition ${
                  form.rank === r ? 'bg-[#3b82f6] text-white' : 'bg-[#18223a] text-[#cdd6e3]'
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          <div className="mb-1 mt-3 text-xs font-bold text-[#e7ecf3]">دسترسی ارجاعات</div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setForm({ ...form, referralScope: 'MANAGERS_ONLY' })}
              className={`rounded-lg px-3 py-2 text-[11px] font-bold transition ${
                form.referralScope === 'MANAGERS_ONLY' ? 'bg-[#3b82f6] text-white' : 'bg-[#18223a] text-[#cdd6e3]'
              }`}
            >
              فقط مدیران بخش‌ها
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...form, referralScope: 'ALL_STAFF' })}
              className={`rounded-lg px-3 py-2 text-[11px] font-bold transition ${
                form.referralScope === 'ALL_STAFF' ? 'bg-[#3b82f6] text-white' : 'bg-[#18223a] text-[#cdd6e3]'
              }`}
            >
              همه کارمندان
            </button>
          </div>

          <div className="mb-1 mt-3 text-xs font-bold text-[#e7ecf3]">واحد سازمانی</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {DEPT_OPTIONS.map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => selectDept(d.value)}
                className={`rounded-xl border px-4 py-3 text-right transition ${
                  form.dept === d.value ? 'border-[#3b82f6] bg-[#23395f] text-white' : 'border-[#28344c] bg-[#101827] text-[#cdd6e3]'
                }`}
              >
                <span className="flex items-center gap-2 text-xs font-extrabold">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                  {d.label}
                </span>
                <span className="mt-1 block text-[9.5px] font-normal text-[#6b7b94]">زیرمجموعه {d.manager}</span>
              </button>
            ))}
            {customDepts.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => selectDept(d.id)}
                className={`rounded-xl border px-4 py-3 text-right text-[11px] font-bold transition ${
                  form.dept === d.id ? 'border-[#f59e0b] bg-[#f59e0b]/10 text-white' : 'border-[#28344c] bg-[#101827] text-[#cdd6e3]'
                }`}
              >
                {d.label}
                <span className="mt-1 block text-[9.5px] font-normal text-[#6b7b94]">واحد سازمانی سفارشی</span>
              </button>
            ))}
          </div>
          {addingDept ? (
            <div className="mt-2 flex gap-2">
              <input
                value={newDeptName}
                onChange={(e) => setNewDeptName(e.target.value)}
                placeholder="نام واحد جدید (مثلاً بازاریابی)"
                className="flex-1 rounded-lg border border-[#1f2a3d] p-2.5 text-xs outline-none focus:border-[#3b82f6]"
              />
              <button
                type="button"
                onClick={submitNewDept}
                className="rounded-lg bg-[#3b82f6] px-3 py-2 text-[11px] font-bold text-white"
              >
                افزودن
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddingDept(false);
                  setNewDeptName('');
                }}
                className="rounded-lg border border-[#1f2a3d] px-3 py-2 text-[11px] font-bold text-[#cdd6e3]"
              >
                انصراف
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddingDept(true)}
              className="mt-2 text-[11px] font-bold text-[#3b82f6]"
            >
              + ایجاد واحد سازمانی جدید
            </button>
          )}

          {form.dept.startsWith('custom_') && catalogGroups.length === 0 && (
            <p className="mt-2 text-[10.5px] text-[#6b7b94]">
              برای واحد سفارشی، کاتالوگ دسترسی از پیش تعریف نشده — پس از ایجاد حساب می‌توانید دسترسی‌ها
              را در جزئیات اضافه کنید.
            </p>
          )}

          {catalogGroups.length > 0 && (
            <div className="mt-3">
              <div className="mb-2 flex items-center justify-between gap-3 text-[10.5px] text-[#6b7b94]">
                <span>دسترسی‌های واحد</span>
                <span>{faDigits(selectedPerms.size)} دسترسی انتخاب شده</span>
              </div>
              <div className="flex flex-col gap-2">
                {catalogGroups.map((g) => (
                  <div key={g.sectionKey}>
                    <div className="mb-1 text-[11px] font-bold text-[#cdd6e3]">{g.sectionLabelFa}</div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {g.perms.map((p) => {
                        const checked = selectedPerms.has(p.key);
                        return (
                          <label
                            key={p.key}
                            className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-2.5 py-2 text-right text-[11px] transition ${
                              checked ? 'border-[#3b82f6] bg-[#3b82f6]/10 text-[#3b82f6]' : 'border-[#1f2a3d] text-[#cdd6e3]'
                            }`}
                          >
                            <span>{p.labelFa}</span>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setSelectedPerms((prev) =>
                                  togglePermissionSelection(prev, p.key),
                                )
                              }
                              className="h-4 w-4 shrink-0 accent-[#3b82f6]"
                            />
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {addError && (
            <p role="alert" className="mt-2 text-xs text-[#f87171]">
              {addError}
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setAddOpen(false)} className="rounded-lg bg-[#18223a] px-4 py-2 text-xs font-bold text-[#cdd6e3]">
              انصراف
            </button>
            <button
              onClick={() => void onCreate()}
              className="rounded-lg bg-[#3b82f6] px-4 py-2 text-xs font-bold text-white transition hover:brightness-110"
            >
              ایجاد حساب و اعلان به مدیر
            </button>
          </div>
        </section>
      )}

      {statusConfirm && (
        <Modal variant="dark" title="تعلیق حساب کارمند" onClose={() => setStatusConfirm(null)}>
          <p className="mb-4 text-xs text-[#6b7b94]">
            آیا حساب «{statusConfirm.fullName}» معلق شود؟ کارمند تا زمان فعال‌سازی مجدد نمی‌تواند وارد
            سامانه شود.
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setStatusConfirm(null)}
              className="rounded-lg bg-[#18223a] px-4 py-2 text-xs font-bold text-[#cdd6e3]"
            >
              انصراف
            </button>
            <button
              onClick={() => void confirmSuspend()}
              className="rounded-lg bg-danger px-4 py-2 text-xs font-bold text-white"
            >
              تعلیق حساب
            </button>
          </div>
        </Modal>
      )}

      {deleteConfirm && (
        <Modal variant="dark" title="حذف حساب کارمند" onClose={() => setDeleteConfirm(null)}>
          <p className="mb-3 text-xs leading-6 text-[#9fb0c7]">
            حساب «{deleteConfirm.fullName}» از فهرست کاربران حذف می‌شود و دیگر امکان ورود نخواهد داشت.
          </p>
          <p className="mb-4 rounded-lg bg-[rgba(245,158,11,.1)] p-3 text-[11px] leading-6 text-[#fbbf24]">
            نشست‌ها و دسترسی‌ها فوراً لغو می‌شوند؛ سوابق مالی و لاگ‌های امنیتی برای حسابرسی باقی می‌مانند. این عملیات قابل فعال‌سازی مجدد نیست.
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setDeleteConfirm(null)}
              className="rounded-lg bg-[#18223a] px-4 py-2 text-xs font-bold text-[#cdd6e3]"
            >
              انصراف
            </button>
            <button
              onClick={() => void confirmDelete()}
              className="rounded-lg bg-danger px-4 py-2 text-xs font-bold text-white"
            >
              حذف و بایگانی حساب
            </button>
          </div>
        </Modal>
      )}

      {createdCredentials && (
        <Modal
          variant="dark"
          title="اطلاعات ورود کارمند"
          onClose={() => setCreatedCredentials(null)}
        >
          <p className="mb-4 text-xs leading-6 text-[#9fb0c7]">
            حساب «{createdCredentials.fullName}» فعال شد. این اطلاعات را فقط از مسیر امن در اختیار
            کارمند قرار دهید؛ رمز اولیه پس از بستن این پنجره دوباره نمایش داده نمی‌شود.
          </p>
          <dl className="space-y-3 rounded-xl border border-[#1f2a3d] bg-[#101827] p-4 text-xs">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-[#9fb0c7]">نام کاربری</dt>
              <dd className="font-num ltr select-all font-bold text-white">
                {createdCredentials.username}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-[#9fb0c7]">شماره موبایل دریافت کد</dt>
              <dd className="font-num ltr select-all font-bold text-white">
                {faDigits(createdCredentials.phone)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-[#9fb0c7]">رمز عبور اولیه</dt>
              <dd className="font-num ltr select-all font-bold text-white">
                {createdCredentials.password}
              </dd>
            </div>
          </dl>
          <p className="mt-4 rounded-xl border border-[#27416c] bg-[#152848] p-3 text-[11px] leading-6 text-[#cdd6e3]">
            کارمند از صفحه ورود مدیران و کارمندان، ابتدا نام کاربری و همین رمز را وارد می‌کند؛ کد
            ورود دومرحله‌ای به شماره موبایل ثبت‌شده ارسال می‌شود.
          </p>
          <button
            type="button"
            onClick={() => setCreatedCredentials(null)}
            className="mt-4 w-full rounded-lg bg-[#3b82f6] px-4 py-2.5 text-xs font-bold text-white"
          >
            متوجه شدم
          </button>
        </Modal>
      )}

      {detailId && detail && (
        <Modal variant="dark" title={detail.fullName} onClose={() => setDetailId(null)}>
          <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-[#18223a] p-2.5">
              <div className="text-[10px] text-[#6b7b94]">آخرین ورود</div>
              <div className="font-num font-bold text-[#e7ecf3]">
                {detail.lastLoginAt ? formatJalaliDateTime(detail.lastLoginAt) : '—'}
              </div>
            </div>
            <div className="rounded-lg bg-[#18223a] p-2.5">
              <div className="text-[10px] text-[#6b7b94]">نام کاربری</div>
              <div className="font-num ltr font-bold text-[#e7ecf3]">{detail.username}</div>
            </div>
          </div>

          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs font-bold text-[#e7ecf3]">
              دسترسی‌های فعال{' '}
              <span className="text-[10.5px] font-normal text-[#6b7b94]">
                ({faDigits(detail.permissions.length)})
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            {detail.permissions.map((p) => (
              <div key={p.key} className="flex items-center gap-2 rounded-lg border border-[#10b98140] bg-[#10b98108] p-2">
                <span className="flex-1 text-[11px] text-[#cdd6e3]">{p.labelFa}</span>
                {canManageAccess && (
                  <button onClick={() => void onGrant(p.key, false)} className="text-[10px] font-bold text-[#f87171]">حذف</button>
                )}
              </div>
            ))}
          </div>

          {canManageAccess && detail.available.length > 0 && (
            <div className="mt-3 border-t border-[#1f2a3d] pt-3">
              <div className="mb-2 text-xs font-bold text-[#e7ecf3]">افزودن دسترسی</div>
              <div className="grid grid-cols-2 gap-1.5">
                {detail.available.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => void onGrant(p.key, true)}
                    className="rounded-lg border border-dashed border-[#1f2a3d] p-2 text-right text-[11px] text-[#cdd6e3]"
                  >
                    + {p.labelFa}
                  </button>
                ))}
              </div>
            </div>
          )}

          {tempPassword && (
            <div className="mt-4 rounded-lg border border-[#3b82f6]/40 bg-[#3b82f6]/10 p-3">
              <div className="text-[10px] text-[#6b7b94]">رمز موقت تولیدشده</div>
              <div className="font-num ltr mt-1 text-sm font-black text-[#3b82f6]">{tempPassword}</div>
            </div>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => void onResetPassword()}
              className="rounded-lg bg-[#3b82f6] px-4 py-2 text-xs font-bold text-white transition hover:brightness-110"
            >
              بازنشانی رمز عبور
            </button>
            <button onClick={() => setDetailId(null)} className="rounded-lg bg-[#18223a] px-4 py-2 text-xs font-bold text-[#cdd6e3]">
              بستن
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
