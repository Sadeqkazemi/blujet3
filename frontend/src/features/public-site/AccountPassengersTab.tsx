import { useEffect, useState } from 'react';
import { useLocale, type StoredLocale } from '../../hooks/useLocale';
import { isoDateToFormParts, localeDigits } from '../../lib/locale-format';
import { splitPersonName } from '../../lib/person-name';
import type { SavedPassenger } from '../../types/public-site';

const STR: Record<
  StoredLocale,
  {
    hdr: string;
    sub: string;
    empty: string;
    add: string;
    remove: string;
    save: string;
    cancel: string;
    edit: string;
    firstName: string;
    lastName: string;
    firstNameLatin: string;
    lastNameLatin: string;
    nationalId: string;
    passportNo: string;
    mobile: string;
    isChild: string;
    gender: string;
    male: string;
    female: string;
    dateOfBirth: string;
    day: string;
    month: string;
    year: string;
    modalAdd: string;
    modalEdit: string;
    idRequired: string;
    genderRequired: string;
    birthRequired: string;
  }
> = {
  fa: {
    hdr: 'مسافران ذخیره‌شده',
    sub: 'مسافرانی که برای رزروهای بعدی ذخیره کرده‌اید',
    empty: 'مسافری ذخیره نشده است.',
    add: 'افزودن مسافر',
    remove: 'حذف',
    save: 'ذخیره',
    cancel: 'انصراف',
    edit: 'ویرایش',
    firstName: 'نام',
    lastName: 'نام خانوادگی',
    firstNameLatin: 'نام لاتین',
    lastNameLatin: 'نام خانوادگی لاتین',
    nationalId: 'کد ملی',
    passportNo: 'شماره گذرنامه',
    mobile: 'موبایل',
    isChild: 'مسافر کودک',
    gender: 'جنسیت',
    male: 'مرد',
    female: 'زن',
    dateOfBirth: 'تاریخ تولد',
    day: 'روز',
    month: 'ماه',
    year: 'سال',
    modalAdd: 'افزودن مسافر',
    modalEdit: 'ویرایش مسافر',
    idRequired: 'حداقل یکی از کد ملی یا گذرنامه الزامی است.',
    genderRequired: 'انتخاب جنسیت الزامی است.',
    birthRequired: 'تاریخ تولد را کامل وارد کنید.',
  },
  en: {
    hdr: 'Saved Passengers',
    sub: 'Passengers saved for future bookings',
    empty: 'No passengers saved.',
    add: 'Add Passenger',
    remove: 'Remove',
    save: 'Save',
    cancel: 'Cancel',
    edit: 'Edit',
    firstName: 'First name',
    lastName: 'Last name',
    firstNameLatin: 'Latin first name',
    lastNameLatin: 'Latin last name',
    nationalId: 'National ID',
    passportNo: 'Passport number',
    mobile: 'Mobile',
    isChild: 'Child passenger',
    gender: 'Gender',
    male: 'Male',
    female: 'Female',
    dateOfBirth: 'Date of birth',
    day: 'Day',
    month: 'Month',
    year: 'Year',
    modalAdd: 'Add passenger',
    modalEdit: 'Edit passenger',
    idRequired: 'At least one of national ID or passport is required.',
    genderRequired: 'Gender is required.',
    birthRequired: 'Please complete the date of birth.',
  },
  ar: {
    hdr: 'المسافرون المحفوظون',
    sub: 'مسافرون حفظتهم للحجوزات القادمة',
    empty: 'لا يوجد مسافرون محفوظون.',
    add: 'إضافة مسافر',
    remove: 'إزالة',
    save: 'حفظ',
    cancel: 'إلغاء',
    edit: 'تعديل',
    firstName: 'الاسم الأول',
    lastName: 'اسم العائلة',
    firstNameLatin: 'الاسم الأول باللاتينية',
    lastNameLatin: 'اسم العائلة باللاتينية',
    nationalId: 'الرقم الوطني',
    passportNo: 'رقم جواز السفر',
    mobile: 'الجوال',
    isChild: 'مسافر طفل',
    gender: 'الجنس',
    male: 'ذكر',
    female: 'أنثى',
    dateOfBirth: 'تاريخ الميلاد',
    day: 'يوم',
    month: 'شهر',
    year: 'سنة',
    modalAdd: 'إضافة مسافر',
    modalEdit: 'تعديل المسافر',
    idRequired: 'مطلوب الرقم الوطني أو جواز السفر على الأقل.',
    genderRequired: 'الجنس مطلوب.',
    birthRequired: 'يرجى إكمال تاريخ الميلاد.',
  },
};

export interface SavedPassengerForm {
  firstName: string;
  lastName: string;
  firstNameLatin: string;
  lastNameLatin: string;
  gender: '' | 'male' | 'female';
  birthDay: string;
  birthMonth: string;
  birthYear: string;
  nationalId: string;
  passportNo: string;
  mobile: string;
  isChild: boolean;
}

export const emptyPassengerForm = (): SavedPassengerForm => ({
  firstName: '',
  lastName: '',
  firstNameLatin: '',
  lastNameLatin: '',
  gender: '',
  birthDay: '',
  birthMonth: '',
  birthYear: '',
  nationalId: '',
  passportNo: '',
  mobile: '',
  isChild: false,
});

export function passengerInitials(fullName: string): string {
  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('');
}

export function passengerMeta(p: SavedPassenger): string {
  const idPart = p.passportNo ?? p.nationalId ?? '';
  return `${p.latinName}${idPart ? ` · ${idPart}` : ''}`;
}

interface Props {
  passengers: SavedPassenger[];
  busyId: string | null;
  formBusy: boolean;
  formError: string | null;
  openAddOnMount?: boolean;
  onAddModalOpened?: () => void;
  onRemove: (id: string) => void;
  onSave: (form: SavedPassengerForm, editingId: string | null) => Promise<void>;
}

export default function AccountPassengersTab({
  passengers,
  busyId,
  formBusy,
  formError,
  openAddOnMount = false,
  onAddModalOpened,
  onRemove,
  onSave,
}: Props) {
  const { locale } = useLocale();
  const t = STR[locale];
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SavedPassengerForm>(emptyPassengerForm());
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!openAddOnMount) return;
    setEditingId(null);
    setForm(emptyPassengerForm());
    setLocalError(null);
    setModalOpen(true);
    onAddModalOpened?.();
    // onAddModalOpened is intentionally omitted — parent inline setter is stable enough for one-shot open
  }, [openAddOnMount]);

  function openAdd() {
    setEditingId(null);
    setForm(emptyPassengerForm());
    setLocalError(null);
    setModalOpen(true);
  }

  function openEdit(p: SavedPassenger) {
    const birth = p.birthDate
      ? isoDateToFormParts(p.birthDate, locale)
      : { birthDay: '', birthMonth: '', birthYear: '' };
    const nativeName = splitPersonName(p.fullName, 'last');
    const latinName = splitPersonName(p.latinName, 'last');
    setEditingId(p.id);
    setForm({
      firstName: nativeName.firstName,
      lastName: nativeName.lastName,
      firstNameLatin: latinName.firstName,
      lastNameLatin: latinName.lastName,
      gender: p.gender ?? '',
      birthDay: birth.birthDay,
      birthMonth: birth.birthMonth,
      birthYear: birth.birthYear,
      nationalId: p.nationalId ?? '',
      passportNo: p.passportNo ?? '',
      mobile: p.mobile ?? '',
      isChild: p.isChild,
    });
    setLocalError(null);
    setModalOpen(true);
  }

  function closeModal() {
    if (formBusy) return;
    setModalOpen(false);
    setEditingId(null);
    setLocalError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (
      !form.firstName.trim() ||
      !form.lastName.trim() ||
      !form.firstNameLatin.trim() ||
      !form.lastNameLatin.trim()
    ) return;
    if (!form.gender) {
      setLocalError(t.genderRequired);
      return;
    }
    if (!form.birthDay || !form.birthMonth || !form.birthYear) {
      setLocalError(t.birthRequired);
      return;
    }
    if (!form.nationalId.trim() && !form.passportNo.trim()) {
      setLocalError(t.idRequired);
      return;
    }
    setLocalError(null);
    void onSave(form, editingId)
      .then(() => {
        setModalOpen(false);
        setEditingId(null);
      })
      .catch(() => undefined);
  }

  return (
    <>
      <div
        data-testid="account-passengers"
        style={{ background: '#fff', border: '1px solid #eef1f5', borderRadius: 16, padding: 18 }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
          }}
        >
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 6px' }}>{t.hdr}</h2>
            <p style={{ fontSize: 11.5, color: '#8a96a6', margin: 0 }}>{t.sub}</p>
          </div>
          <button
            type="button"
            data-testid="passengers-add-open"
            onClick={openAdd}
            style={{
              fontSize: 11.5,
              fontWeight: 700,
              color: '#1668c4',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            + {t.add}
          </button>
        </div>

        {passengers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 20, color: '#9aa4b2', fontSize: 11.5 }}>
            {t.empty}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {passengers.map((p) => (
              <div
                key={p.id}
                data-testid="account-passenger"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 11,
                  border: '1px solid #eef1f5',
                  borderRadius: 12,
                  padding: '11px 13px',
                }}
              >
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: '50%',
                    background: '#eef4fb',
                    color: '#1668c4',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: 12,
                    flex: 'none',
                  }}
                >
                  {passengerInitials(p.fullName)}
                </div>
                <div style={{ lineHeight: 1.5, flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700 }}>
                    {p.fullName}
                    {p.isChild && locale === 'fa' ? ' (کودک)' : p.isChild && locale === 'en' ? ' (child)' : p.isChild ? ' (طفل)' : ''}
                  </div>
                  <div
                    dir="ltr"
                    style={{
                      fontSize: 10.5,
                      color: '#9aa4b2',
                      fontFamily: 'Roboto Mono, monospace',
                    }}
                  >
                    {passengerMeta(p)}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={t.edit}
                  data-testid={`passenger-edit-${p.id}`}
                  onClick={() => openEdit(p)}
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#1668c4',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {t.edit}
                </button>
                <button
                  type="button"
                  aria-label={t.remove}
                  data-testid={`passenger-remove-${p.id}`}
                  disabled={busyId === p.id}
                  onClick={() => onRemove(p.id)}
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#e5484d',
                    background: '#fff5f5',
                    border: '1px solid #f7d4d6',
                    borderRadius: 8,
                    cursor: busyId === p.id ? 'wait' : 'pointer',
                    padding: '6px 10px',
                    fontFamily: 'inherit',
                    opacity: busyId === p.id ? 0.65 : 1,
                  }}
                >
                  {busyId === p.id ? '…' : t.remove}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          data-testid="passengers-form-modal"
          onClick={closeModal}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(7,12,22,.55)',
            zIndex: 210,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <form
            data-testid="passengers-form"
            onClick={(e) => e.stopPropagation()}
            onSubmit={submit}
            style={{
              background: '#fff',
              borderRadius: 18,
              width: 760,
              maxWidth: '100%',
              maxHeight: 'calc(100vh - 32px)',
              overflow: 'hidden',
              boxShadow: '0 30px 80px -20px rgba(13,38,102,.35)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                padding: '18px 20px',
                borderBottom: '1px solid #eef1f5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flex: 'none',
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 900, color: '#0d2640' }}>
                {editingId ? t.modalEdit : t.modalAdd}
              </div>
              <button
                type="button"
                onClick={closeModal}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 9,
                  background: '#f4f6fa',
                  color: '#5a6678',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 16,
                }}
              >
                ×
              </button>
            </div>
            <div
              data-testid="passengers-form-fields"
              style={{
                padding: 20,
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: 14,
                overflowY: 'auto',
                minHeight: 0,
                overscrollBehavior: 'contain',
              }}
            >
              {(localError || formError) && (
                <p role="alert" style={{ fontSize: 12, color: '#e5484d', margin: 0, gridColumn: '1 / -1' }}>
                  {localError ?? formError}
                </p>
              )}
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#0d2640' }}>{t.firstName}</span>
                <input
                  required
                  value={form.firstName}
                  onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                  style={inputStyle}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#0d2640' }}>{t.lastName}</span>
                <input
                  required
                  value={form.lastName}
                  onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                  style={inputStyle}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#0d2640' }}>{t.firstNameLatin}</span>
                <input
                  required
                  dir="ltr"
                  value={form.firstNameLatin}
                  onChange={(e) => setForm((f) => ({ ...f, firstNameLatin: e.target.value }))}
                  style={inputStyle}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#0d2640' }}>{t.lastNameLatin}</span>
                <input
                  required
                  dir="ltr"
                  value={form.lastNameLatin}
                  onChange={(e) => setForm((f) => ({ ...f, lastNameLatin: e.target.value }))}
                  style={inputStyle}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#0d2640' }}>{t.gender}</span>
                <select
                  required
                  data-testid="passengers-form-gender"
                  value={form.gender}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      gender: e.target.value as SavedPassengerForm['gender'],
                    }))
                  }
                  style={inputStyle}
                >
                  <option value="">—</option>
                  <option value="male">{t.male}</option>
                  <option value="female">{t.female}</option>
                </select>
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, gridColumn: '1 / -1' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#0d2640' }}>{t.dateOfBirth}</span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1.2fr', gap: 8 }}>
                  <select
                    data-testid="passengers-form-birth-day"
                    value={form.birthDay}
                    onChange={(e) => setForm((f) => ({ ...f, birthDay: e.target.value }))}
                    style={inputStyle}
                  >
                    <option value="">{t.day}</option>
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                      <option key={d} value={String(d)}>
                        {localeDigits(d, locale)}
                      </option>
                    ))}
                  </select>
                  <select
                    data-testid="passengers-form-birth-month"
                    value={form.birthMonth}
                    onChange={(e) => setForm((f) => ({ ...f, birthMonth: e.target.value }))}
                    style={inputStyle}
                  >
                    <option value="">{t.month}</option>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <option key={m} value={String(m)}>
                        {localeDigits(m, locale)}
                      </option>
                    ))}
                  </select>
                  <select
                    data-testid="passengers-form-birth-year"
                    value={form.birthYear}
                    onChange={(e) => setForm((f) => ({ ...f, birthYear: e.target.value }))}
                    style={inputStyle}
                  >
                    <option value="">{t.year}</option>
                    {Array.from({ length: 90 }, (_, i) => {
                      const year =
                        locale === 'fa' ? 1405 - i : new Date().getFullYear() - i;
                      return (
                        <option key={year} value={String(year)}>
                          {localeDigits(year, locale)}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#0d2640' }}>{t.nationalId}</span>
                <input
                  dir="ltr"
                  value={form.nationalId}
                  onChange={(e) => setForm((f) => ({ ...f, nationalId: e.target.value }))}
                  style={inputStyle}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#0d2640' }}>{t.passportNo}</span>
                <input
                  dir="ltr"
                  value={form.passportNo}
                  onChange={(e) => setForm((f) => ({ ...f, passportNo: e.target.value }))}
                  style={inputStyle}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#0d2640' }}>{t.mobile}</span>
                <input
                  dir="ltr"
                  value={form.mobile}
                  onChange={(e) => setForm((f) => ({ ...f, mobile: e.target.value }))}
                  style={inputStyle}
                />
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                <input
                  type="checkbox"
                  checked={form.isChild}
                  onChange={(e) => setForm((f) => ({ ...f, isChild: e.target.checked }))}
                />
                {t.isChild}
              </label>
            </div>
            <div
              style={{
                flex: 'none',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 10,
                padding: '14px 20px',
                borderTop: '1px solid #eef1f5',
                background: '#fff',
              }}
            >
              <button
                type="button"
                onClick={closeModal}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 110,
                  height: 46,
                  borderRadius: 12,
                  background: '#fff',
                  color: '#526071',
                  fontSize: 13,
                  fontWeight: 800,
                  border: '1px solid #d9e1eb',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {t.cancel}
              </button>
              <button
                type="submit"
                data-testid="passengers-form-save"
                disabled={formBusy}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 160,
                  height: 46,
                  borderRadius: 12,
                  background: '#1668c4',
                  color: '#fff',
                  fontSize: 13.5,
                  fontWeight: 800,
                  border: 'none',
                  cursor: formBusy ? 'wait' : 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {formBusy ? '…' : t.save}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  height: 46,
  border: '1.5px solid #e3e8ef',
  borderRadius: 12,
  padding: '0 12px',
  fontSize: 13,
  color: '#16202e',
  fontFamily: 'inherit',
};
