import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import PublicPageShell from '../../components/public/PublicPageShell';
import { applyToJob, fetchJobDetail } from '../../api/careers';
import { dayjs } from '../../lib/jalali';
import { localeDigits, parseLocaleDateToIso } from '../../lib/locale-format';
import { useLocale, type StoredLocale } from '../../hooks/useLocale';
import { useIsMobile } from '../../hooks/useIsMobile';
import type {
  EducationEntry,
  JobApplicantGender,
  JobDetail,
  JobType,
  LanguageEntry,
  MaritalStatus,
  MilitaryStatus,
  WorkEntry,
} from '../../types/careers';
import { jobPostingImageUrl } from './site-content-shared';

const RESUME_MAX_BYTES = 3 * 1024 * 1024;

const JOB_TYPE_LABEL: Record<JobType, string> = {
  FULL_TIME: 'تمام‌وقت',
  REMOTE: 'دورکاری',
  PART_TIME: 'پاره‌وقت',
};

const PROVINCES = [
  'آذربایجان شرقی',
  'آذربایجان غربی',
  'اردبیل',
  'اصفهان',
  'البرز',
  'ایلام',
  'بوشهر',
  'تهران',
  'چهارمحال و بختیاری',
  'خراسان جنوبی',
  'خراسان رضوی',
  'خراسان شمالی',
  'خوزستان',
  'زنجان',
  'سمنان',
  'سیستان و بلوچستان',
  'فارس',
  'قزوین',
  'قم',
  'کردستان',
  'کرمان',
  'کرمانشاه',
  'کهگیلویه و بویراحمد',
  'گلستان',
  'گیلان',
  'لرستان',
  'مازندران',
  'مرکزی',
  'هرمزگان',
  'همدان',
  'یزد',
];

const LANG_OPTIONS: Record<StoredLocale, string[]> = {
  fa: ['انگلیسی', 'عربی', 'فرانسوی', 'آلمانی', 'ترکی استانبولی', 'اسپانیایی', 'روسی', 'چینی'],
  en: ['English', 'Arabic', 'French', 'German', 'Turkish', 'Spanish', 'Russian', 'Chinese'],
  ar: ['الإنجليزية', 'العربية', 'الفرنسية', 'الألمانية', 'التركية', 'الإسبانية', 'الروسية', 'الصينية'],
};
const LEVEL_OPTIONS: Record<StoredLocale, string[]> = {
  fa: ['مبتدی', 'متوسط', 'پیشرفته', 'زبان مادری'],
  en: ['Beginner', 'Intermediate', 'Advanced', 'Native'],
  ar: ['مبتدئ', 'متوسط', 'متقدم', 'لغة أم'],
};
const DEGREE_OPTIONS: Record<StoredLocale, string[]> = {
  fa: ['زیر دیپلم', 'دیپلم', 'کاردانی', 'کارشناسی', 'کارشناسی ارشد', 'دکتری'],
  en: ['Below diploma', 'Diploma', 'Associate', 'Bachelor', 'Master', 'Doctorate'],
  ar: ['أقل من الثانوية', 'الثانوية', 'دبلوم مشارك', 'بكالوريوس', 'ماجستير', 'دكتوراه'],
};

function workYearOptions(locale: StoredLocale): string[] {
  const currentYear = locale === 'fa'
    ? Number(dayjs().calendar('jalali').format('YYYY'))
    : new Date().getUTCFullYear();
  return Array.from({ length: 50 }, (_, i) => String(currentYear - i));
}

const EMPTY_EDU: EducationEntry = { major: '', degree: '', courses: '', otherCourses: '' };
const EMPTY_WORK: WorkEntry = { company: '', position: '', fromYear: '', toYear: '', reason: '' };
const EMPTY_LANG: LanguageEntry = { lang: '', level: '' };

const STR: Record<
  StoredLocale,
  {
    notFound: string;
    back: string;
    hireEyebrow: string;
    generalReqs: string;
    specialReqs: string;
    personalBanner: string;
    personalHeading: string;
    firstName: string;
    lastName: string;
    nationalId: string;
    fatherName: string;
    birthDate: string;
    birthProvince: string;
    birthCity: string;
    gender: string;
    genderFemale: string;
    genderMale: string;
    marital: string;
    maritalSingle: string;
    maritalMarried: string;
    military: string;
    militaryConscript: string;
    militaryExempt: string;
    militaryWaived: string;
    exemptionType: string;
    phone: string;
    email: string;
    residenceProvince: string;
    residenceAddress: string;
    recordsBanner: string;
    education: string;
    addEducation: string;
    eduMajor: string;
    eduDegree: string;
    eduDegreePick: string;
    fileRemove: string;
    eduCourses: string;
    eduOther: string;
    work: string;
    addWork: string;
    workCompany: string;
    workPosition: string;
    workFrom: string;
    workTo: string;
    workReason: string;
    skillsBanner: string;
    skills: string;
    languages: string;
    addLanguage: string;
    langPick: string;
    levelPick: string;
    otherLangs: string;
    filePickLabel: string;
    filePickedHint: string;
    fileChoose: string;
    submit: string;
    submitting: string;
    sentTitle: string;
    sentBody: string;
    sentBack: string;
    toastRequired: string;
    pdfOnly: string;
    pdfTooBig: string;
  }
> = {
  fa: {
    notFound: 'این فرصت شغلی یافت نشد یا دیگر فعال نیست.',
    back: 'بازگشت به فرصت‌های شغلی',
    hireEyebrow: 'استخدام',
    generalReqs: 'شرایط احراز عمومی:',
    specialReqs: 'شرایط احراز تخصصی:',
    personalBanner: 'اطلاعات شخصی',
    personalHeading: 'اطلاعات فردی',
    firstName: 'نام',
    lastName: 'نام خانوادگی',
    nationalId: 'کد ملی',
    fatherName: 'نام پدر',
    birthDate: 'تاریخ تولد (مثال: ۱۳۷۸/۰۵/۲۱)',
    birthProvince: 'استان محل تولد',
    birthCity: 'شهر محل تولد',
    gender: 'جنسیت:',
    genderFemale: 'خانم',
    genderMale: 'آقا',
    marital: 'وضعیت تاهل:',
    maritalSingle: 'مجرد',
    maritalMarried: 'متاهل',
    military: 'خدمت سربازی:',
    militaryConscript: 'مشمول',
    militaryExempt: 'دارای کارت پایان خدمت',
    militaryWaived: 'معافیت',
    exemptionType: 'نوع معافیت',
    phone: 'شماره تماس',
    email: 'آدرس ایمیل',
    residenceProvince: 'استان محل سکونت',
    residenceAddress: 'آدرس محل سکونت',
    recordsBanner: 'سوابق',
    education: 'سوابق تحصیلی/دوره های آموزشی',
    addEducation: 'افزودن سابقه تحصیلی',
    eduMajor: 'رشته تحصیلی',
    eduDegree: 'مقطع تحصیلی',
    eduDegreePick: 'انتخاب تحصیلات',
    eduCourses: 'دوره ها و گواهی‌نامه ها',
    eduOther: 'دوره های آموزشی غیر مرتبط',
    work: 'تجربه کاری / سوابق',
    addWork: 'افزودن سابقه',
    workCompany: 'نام شرکت',
    workPosition: 'سمت سازمانی',
    workFrom: 'از سال',
    workTo: 'تا سال',
    workReason: 'علت قطع همکاری',
    skillsBanner: 'نرم‌افزارها / مهارت‌های تکمیلی',
    skills: 'مهارت های تکمیلی',
    languages: 'آشنایی با زبان های خارجه',
    addLanguage: 'افزودن زبان',
    langPick: 'انتخاب زبان',
    levelPick: 'سطح',
    otherLangs: 'دیگر زبان ها',
    filePickLabel: 'فایل مورد نظر را انتخاب کنید',
    filePickedHint: 'لطفاً فایل با پسوند PDF و حجم حداکثر ۳ مگابایت بارگذاری کنید',
    fileChoose: 'انتخاب فایل',
    fileRemove: 'حذف فایل',
    submit: 'ارسال درخواست',
    submitting: 'در حال ارسال…',
    sentTitle: 'درخواست شما با موفقیت ثبت شد',
    sentBody:
      'پس از بررسی رزومه توسط واحد منابع انسانی، در صورت تأیید صلاحیت، از طریق شماره تماس یا ایمیل با شما تماس گرفته می‌شود.',
    sentBack: 'بازگشت به فرصت‌های شغلی',
    toastRequired: 'لطفاً حداقل نام، نام خانوادگی، کد ملی و شماره تماس را وارد کنید',
    pdfOnly: 'فقط فایل PDF مجاز است.',
    pdfTooBig: 'حداکثر حجم مجاز فایل رزومه ۳ مگابایت است.',
  },
  en: {
    notFound: 'This position was not found or is no longer active.',
    back: 'Back to careers',
    hireEyebrow: 'Hiring',
    generalReqs: 'General requirements:',
    specialReqs: 'Specialized requirements:',
    personalBanner: 'Personal information',
    personalHeading: 'Personal details',
    firstName: 'First name',
    lastName: 'Last name',
    nationalId: 'National ID',
    fatherName: "Father's name",
    birthDate: 'Date of birth (e.g. 1999/08/12)',
    birthProvince: 'Province of birth',
    birthCity: 'City of birth',
    gender: 'Gender:',
    genderFemale: 'Female',
    genderMale: 'Male',
    marital: 'Marital status:',
    maritalSingle: 'Single',
    maritalMarried: 'Married',
    military: 'Military service:',
    militaryConscript: 'Conscript',
    militaryExempt: 'Completed service',
    militaryWaived: 'Exempt',
    exemptionType: 'Exemption type',
    phone: 'Phone number',
    email: 'Email address',
    residenceProvince: 'Province of residence',
    residenceAddress: 'Home address',
    recordsBanner: 'Background',
    education: 'Education / training',
    addEducation: 'Add education',
    eduMajor: 'Field of study',
    eduDegree: 'Degree',
    eduDegreePick: 'Select education level',
    eduCourses: 'Courses and certificates',
    eduOther: 'Unrelated courses',
    work: 'Work experience',
    addWork: 'Add experience',
    workCompany: 'Company',
    workPosition: 'Role',
    workFrom: 'From year',
    workTo: 'To year',
    workReason: 'Reason for leaving',
    skillsBanner: 'Software / additional skills',
    skills: 'Additional skills',
    languages: 'Foreign languages',
    addLanguage: 'Add language',
    langPick: 'Select language',
    levelPick: 'Level',
    otherLangs: 'Other languages',
    filePickLabel: 'Choose a file',
    filePickedHint: 'PDF only, max 3 MB',
    fileChoose: 'Browse',
    fileRemove: 'Remove file',
    submit: 'Submit application',
    submitting: 'Submitting…',
    sentTitle: 'Your application was submitted successfully',
    sentBody: 'HR will review your resume and contact you if there is a fit.',
    sentBack: 'Back to careers',
    toastRequired: 'Please enter at least first name, last name, national ID and phone',
    pdfOnly: 'Only PDF files are allowed.',
    pdfTooBig: 'Resume must be 3 MB or smaller.',
  },
  ar: {
    notFound: 'لم يتم العثور على هذه الوظيفة أو لم تعد نشطة.',
    back: 'العودة إلى الوظائف',
    hireEyebrow: 'توظيف',
    generalReqs: 'الشروط العامة:',
    specialReqs: 'الشروط التخصصية:',
    personalBanner: 'المعلومات الشخصية',
    personalHeading: 'البيانات الفردية',
    firstName: 'الاسم الأول',
    lastName: 'اسم العائلة',
    nationalId: 'الرقم الوطني',
    fatherName: 'اسم الأب',
    birthDate: 'تاريخ الميلاد (مثال: ١٩٩٩/٠٨/١٢)',
    birthProvince: 'محافظة الميلاد',
    birthCity: 'مدينة الميلاد',
    gender: 'الجنس:',
    genderFemale: 'أنثى',
    genderMale: 'ذكر',
    marital: 'الحالة الاجتماعية:',
    maritalSingle: 'أعزب',
    maritalMarried: 'متزوج',
    military: 'الخدمة العسكرية:',
    militaryConscript: 'مكلف',
    militaryExempt: 'أنهى الخدمة',
    militaryWaived: 'معفى',
    exemptionType: 'نوع الإعفاء',
    phone: 'رقم الهاتف',
    email: 'البريد الإلكتروني',
    residenceProvince: 'محافظة السكن',
    residenceAddress: 'عنوان السكن',
    recordsBanner: 'السجلات',
    education: 'المؤهلات الدراسية / الدورات',
    addEducation: 'إضافة مؤهل',
    eduMajor: 'التخصص',
    eduDegree: 'المرحلة',
    eduDegreePick: 'اختر التحصيل الدراسي',
    eduCourses: 'الدورات والشهادات',
    eduOther: 'دورات غير مرتبطة',
    work: 'الخبرات العملية',
    addWork: 'إضافة خبرة',
    workCompany: 'اسم الشركة',
    workPosition: 'المسمى الوظيفي',
    workFrom: 'من سنة',
    workTo: 'إلى سنة',
    workReason: 'سبب ترك العمل',
    skillsBanner: 'البرامج / المهارات الإضافية',
    skills: 'مهارات إضافية',
    languages: 'اللغات الأجنبية',
    addLanguage: 'إضافة لغة',
    langPick: 'اختر اللغة',
    levelPick: 'المستوى',
    otherLangs: 'لغات أخرى',
    filePickLabel: 'اختر الملف',
    filePickedHint: 'PDF فقط، بحد أقصى ٣ ميغابايت',
    fileChoose: 'اختيار ملف',
    fileRemove: 'حذف الملف',
    submit: 'إرسال الطلب',
    submitting: 'جارٍ الإرسال…',
    sentTitle: 'تم إرسال طلبك بنجاح',
    sentBody: 'سيراجع قسم الموارد البشرية سيرتك ويتواصل معك عند الحاجة.',
    sentBack: 'العودة إلى الوظائف',
    toastRequired: 'يرجى إدخال الاسم واسم العائلة والرقم الوطني ورقم الهاتف على الأقل',
    pdfOnly: 'يُسمح بملفات PDF فقط.',
    pdfTooBig: 'الحد الأقصى لحجم السيرة ٣ ميغابايت.',
  },
};

const PAGE_PAD_X = 26;

const CAREERS_APPLY_CSS = `
  .careers-apply-root { width: 100%; box-sizing: border-box; overflow-x: clip; }
  .careers-apply-pad { padding-inline: ${PAGE_PAD_X}px; box-sizing: border-box; }
  .careers-g2, .careers-g3, .careers-g4, .careers-reqs {
    display: grid;
    grid-template-columns: 1fr;
    gap: 11px;
    min-width: 0;
  }
  .careers-radios {
    display: grid;
    grid-template-columns: 1fr;
    gap: 22px;
    min-width: 0;
  }
  .careers-job-head {
    display: flex;
    align-items: center;
    gap: 18px;
    flex-wrap: wrap;
    min-width: 0;
  }
  @media (min-width: 640px) {
    .careers-g2, .careers-g3, .careers-g4 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .careers-reqs { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 26px; }
    .careers-radios { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (min-width: 980px) {
    .careers-g3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .careers-g4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .careers-radios { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }
`;

const inputStyle: React.CSSProperties = {
  height: 46,
  border: '1.5px solid #e2e7ee',
  borderRadius: 11,
  background: '#fafbfd',
  padding: '0 12px',
  fontFamily: 'inherit',
  fontSize: 12.5,
  outline: 'none',
  width: '100%',
  maxWidth: '100%',
  color: '#16202e',
  boxSizing: 'border-box',
  minWidth: 0,
};

function SectionBanner({ children }: { children: string }) {
  return (
    <div
      style={{
        background: '#eef1f5',
        borderRadius: 10,
        padding: '11px 16px',
        fontSize: 13,
        fontWeight: 700,
        color: '#5a6678',
        marginBottom: 22,
      }}
    >
      {children}
    </div>
  );
}

function RadioRow({
  name,
  label,
  value,
  options,
  onChange,
}: {
  name: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 9 }}>{label}</div>
      <div style={{ display: 'flex', gap: 16, fontSize: 12.5, flexWrap: 'wrap' }}>
        {options.map((o) => (
          <label key={o.value} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
            <input
              type="radio"
              name={name}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />
            {o.label}
          </label>
        ))}
      </div>
    </div>
  );
}

export default function CareersApplyPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const { locale } = useLocale();
  const isMobile = useIsMobile();
  const t = STR[locale];
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [job, setJob] = useState<JobDetail | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [fatherName, setFatherName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [birthProvince, setBirthProvince] = useState('');
  const [birthCity, setBirthCity] = useState('');
  const [gender, setGender] = useState<JobApplicantGender | ''>('');
  const [marital, setMarital] = useState<MaritalStatus | ''>('');
  const [military, setMilitary] = useState<MilitaryStatus | ''>('');
  const [exemptionType, setExemptionType] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [residenceProvince, setResidenceProvince] = useState('');
  const [residenceAddress, setResidenceAddress] = useState('');
  const [skills, setSkills] = useState('');
  const [otherLangs, setOtherLangs] = useState('');
  const [eduEntries, setEduEntries] = useState<EducationEntry[]>([{ ...EMPTY_EDU }]);
  const [workEntries, setWorkEntries] = useState<WorkEntry[]>([{ ...EMPTY_WORK }]);
  const [langEntries, setLangEntries] = useState<LanguageEntry[]>([{ ...EMPTY_LANG }]);
  const [resume, setResume] = useState<File | null>(null);
  const [resumeError, setResumeError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;
    fetchJobDetail(jobId)
      .then(setJob)
      .catch(() => setNotFound(true));
  }, [jobId]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(id);
  }, [toast]);

  function onResumeChange(file: File | null) {
    setResumeError(null);
    if (!file) {
      setResume(null);
      return;
    }
    if (file.type !== 'application/pdf') {
      setResumeError(t.pdfOnly);
      setResume(null);
      return;
    }
    if (file.size > RESUME_MAX_BYTES) {
      setResumeError(t.pdfTooBig);
      setResume(null);
      return;
    }
    setResume(file);
  }

  const canSubmit =
    !!firstName.trim() && !!lastName.trim() && !!nationalId.trim() && !!phone.trim() && !resumeError;

  function nonemptyEntries<T extends Record<string, string | undefined>>(entries: T[]): T[] {
    return entries.filter((e) => Object.values(e).some((v) => (v ?? '').trim().length > 0));
  }

  async function onSubmit() {
    if (!jobId) return;
    if (!canSubmit) {
      setToast(t.toastRequired);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const isoBirthDate = birthDate.trim() ? parseLocaleDateToIso(birthDate.trim(), locale) : null;
      await applyToJob(jobId, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        nationalId: nationalId.trim(),
        fatherName: fatherName.trim() || undefined,
        birthDate: isoBirthDate ?? undefined,
        birthProvince: birthProvince || undefined,
        birthCity: birthCity.trim() || undefined,
        gender: gender || undefined,
        marital: marital || undefined,
        military: military || undefined,
        exemptionType: military === 'WAIVED' ? exemptionType.trim() || undefined : undefined,
        phone: phone.trim(),
        email: email.trim() || undefined,
        residenceProvince: residenceProvince || undefined,
        residenceAddress: residenceAddress.trim() || undefined,
        skills: skills.trim() || undefined,
        otherLangs: otherLangs.trim() || undefined,
        eduEntries: nonemptyEntries(eduEntries),
        workEntries: nonemptyEntries(workEntries),
        langEntries: nonemptyEntries(langEntries),
        resume: resume ?? undefined,
      });
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطا در ثبت درخواست.');
    } finally {
      setSubmitting(false);
    }
  }

  if (notFound) {
    return (
      <PublicPageShell>
        <style>{CAREERS_APPLY_CSS}</style>
        <div
          className="careers-apply-root careers-apply-pad"
          data-testid="careers-apply-not-found"
          style={{ maxWidth: 640, margin: '60px auto', textAlign: 'center' }}
        >
          <p style={{ fontSize: 14, color: '#5a6678' }}>{t.notFound}</p>
        </div>
      </PublicPageShell>
    );
  }

  if (!job) {
    return (
      <PublicPageShell>
        <style>{CAREERS_APPLY_CSS}</style>
        <div
          className="careers-apply-root careers-apply-pad"
          data-testid="careers-apply-loading"
          style={{ maxWidth: 640, margin: '60px auto', textAlign: 'center' }}
        >
          <p style={{ fontSize: 14, color: '#5a6678' }}>
            {locale === 'en' ? 'Loading…' : locale === 'ar' ? 'جارٍ التحميل…' : 'در حال بارگذاری…'}
          </p>
        </div>
      </PublicPageShell>
    );
  }

  const img = jobPostingImageUrl(job.imageUrl, job.imageFileId);
  const jobMeta = `${job.dept} · ${job.city} · ${JOB_TYPE_LABEL[job.type]}`;

  return (
    <PublicPageShell>
      <style>{CAREERS_APPLY_CSS}</style>
      <div className="careers-apply-root">
      <div style={{ background: '#eef3fa', borderBottom: '1px solid #e6eaf0' }}>
        <div className="careers-apply-pad" style={{ maxWidth: 1400, margin: '0 auto', paddingBlock: 10 }}>
          <Link
            to="/careers"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12.5,
              fontWeight: 700,
              color: '#1668c4',
              textDecoration: 'none',
            }}
          >
            ← {t.back}
          </Link>
        </div>
      </div>

      {sent ? (
        <section
          className="careers-apply-pad"
          style={{ maxWidth: 640, margin: isMobile ? '40px auto' : '70px auto', textAlign: 'center' }}
        >
          <div
            data-testid="apply-sent"
            style={{
              background: '#fff',
              border: '1px solid #eef1f5',
              borderRadius: 18,
              padding: isMobile ? '32px 18px' : '44px 30px',
            }}
          >
            <div
              style={{
                width: 74,
                height: 74,
                borderRadius: '50%',
                background: '#eef9f1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 18px',
              }}
            >
              <span
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  background: '#1f8a5b',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 20,
                }}
              >
                ✓
              </span>
            </div>
            <h2 style={{ fontSize: 19, fontWeight: 900, margin: '0 0 8px', color: '#16202e' }}>{t.sentTitle}</h2>
            <p style={{ fontSize: 13.5, color: '#7a8794', margin: 0 }}>{t.sentBody}</p>
            <Link
              to="/careers"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 22,
                fontSize: 13.5,
                fontWeight: 800,
                color: '#fff',
                background: 'linear-gradient(135deg,#1668c4,#0d3b66)',
                padding: '13px 26px',
                borderRadius: 12,
                textDecoration: 'none',
                boxShadow: '0 14px 28px -12px rgba(22,104,196,.55)',
              }}
            >
              ← {t.sentBack}
            </Link>
          </div>
        </section>
      ) : (
        <>
          <section
            className="careers-apply-pad"
            style={{ background: '#fff', borderBottom: '1px solid #eef1f5', paddingBlock: isMobile ? 20 : 26 }}
          >
            <div className="careers-job-head" style={{ maxWidth: 900, margin: '0 auto' }}>
              <div
                style={{
                  width: isMobile ? 64 : 78,
                  height: isMobile ? 64 : 78,
                  borderRadius: 14,
                  background: '#eef3fa',
                  flex: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                }}
              >
                {img ? (
                  <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: 28, color: '#1668c4' }}>✈</span>
                )}
              </div>
              <div style={{ minWidth: 0, flex: '1 1 200px' }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#9aa4b2' }}>{t.hireEyebrow}</div>
                <h1
                  style={{
                    fontSize: isMobile ? 18 : 22,
                    fontWeight: 900,
                    margin: '4px 0 0',
                    color: '#16202e',
                    lineHeight: 1.3,
                    wordBreak: 'break-word',
                  }}
                >
                  {job.title}
                </h1>
                <div style={{ fontSize: 12.5, color: '#7a8794', marginTop: 4 }}>{jobMeta}</div>
              </div>
            </div>
          </section>

          {((job.generalReqs?.length ?? 0) > 0 || (job.specialReqs?.length ?? 0) > 0) && (
            <section
              className="careers-apply-pad careers-reqs"
              style={{
                maxWidth: 900,
                margin: '30px auto 0',
              }}
            >
              {(job.generalReqs?.length ?? 0) > 0 && (
                <div>
                  <h3 style={{ fontSize: 14.5, fontWeight: 800, margin: '0 0 12px' }}>{t.generalReqs}</h3>
                  <ul
                    style={{
                      margin: 0,
                      paddingInlineStart: 18,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 9,
                      fontSize: 13,
                      color: '#3b4554',
                      lineHeight: 1.7,
                    }}
                  >
                    {(job.generalReqs ?? []).map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
              {(job.specialReqs?.length ?? 0) > 0 && (
                <div>
                  <h3 style={{ fontSize: 14.5, fontWeight: 800, margin: '0 0 12px' }}>{t.specialReqs}</h3>
                  <ul
                    style={{
                      margin: 0,
                      paddingInlineStart: 18,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 9,
                      fontSize: 13,
                      color: '#3b4554',
                      lineHeight: 1.7,
                    }}
                  >
                    {(job.specialReqs ?? []).map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          <section
            className="careers-apply-pad"
            style={{ maxWidth: 900, margin: isMobile ? '24px auto 56px' : '34px auto 70px' }}
          >
            <SectionBanner>{t.personalBanner}</SectionBanner>
            <h3 style={{ fontSize: isMobile ? 14.5 : 15.5, fontWeight: 800, margin: '0 0 16px' }}>
              {t.personalHeading}
            </h3>

            <div className="careers-g4" style={{ marginBottom: 14 }}>
              <input
                data-testid="apply-firstName"
                style={inputStyle}
                placeholder={t.firstName}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
              <input
                data-testid="apply-lastName"
                style={inputStyle}
                placeholder={t.lastName}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
              <input
                data-testid="apply-nationalId"
                dir="ltr"
                style={inputStyle}
                placeholder={t.nationalId}
                value={nationalId}
                onChange={(e) => setNationalId(e.target.value)}
              />
              <input
                style={inputStyle}
                placeholder={t.fatherName}
                value={fatherName}
                onChange={(e) => setFatherName(e.target.value)}
              />
            </div>

            <div className="careers-g3" style={{ marginBottom: 18 }}>
              <input
                dir="ltr"
                style={inputStyle}
                placeholder={t.birthDate}
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
              />
              <select
                style={inputStyle}
                value={birthProvince}
                onChange={(e) => setBirthProvince(e.target.value)}
              >
                <option value="">{t.birthProvince}</option>
                {PROVINCES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <input
                style={inputStyle}
                placeholder={t.birthCity}
                value={birthCity}
                onChange={(e) => setBirthCity(e.target.value)}
              />
            </div>

            <div className="careers-radios" style={{ marginBottom: 20 }}>
              <RadioRow
                name="gender"
                label={t.gender}
                value={gender}
                onChange={(v) => setGender(v as JobApplicantGender)}
                options={[
                  { value: 'FEMALE', label: t.genderFemale },
                  { value: 'MALE', label: t.genderMale },
                ]}
              />
              <RadioRow
                name="marital"
                label={t.marital}
                value={marital}
                onChange={(v) => setMarital(v as MaritalStatus)}
                options={[
                  { value: 'SINGLE', label: t.maritalSingle },
                  { value: 'MARRIED', label: t.maritalMarried },
                ]}
              />
              <div>
                <RadioRow
                  name="military"
                  label={t.military}
                  value={military}
                  onChange={(v) => setMilitary(v as MilitaryStatus)}
                  options={[
                    { value: 'CONSCRIPT', label: t.militaryConscript },
                    { value: 'EXEMPT', label: t.militaryExempt },
                    { value: 'WAIVED', label: t.militaryWaived },
                  ]}
                />
                {military === 'WAIVED' && (
                  <input
                    style={{ ...inputStyle, marginTop: 9, height: 40 }}
                    placeholder={t.exemptionType}
                    value={exemptionType}
                    onChange={(e) => setExemptionType(e.target.value)}
                  />
                )}
              </div>
            </div>

            <div className="careers-g3" style={{ marginBottom: 11 }}>
              <input
                data-testid="apply-phone"
                dir="ltr"
                style={inputStyle}
                placeholder={t.phone}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <input
                dir="ltr"
                style={inputStyle}
                placeholder={t.email}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <select
                style={inputStyle}
                value={residenceProvince}
                onChange={(e) => setResidenceProvince(e.target.value)}
              >
                <option value="">{t.residenceProvince}</option>
                {PROVINCES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <input
              style={{ ...inputStyle, marginBottom: 26 }}
              placeholder={t.residenceAddress}
              value={residenceAddress}
              onChange={(e) => setResidenceAddress(e.target.value)}
            />

            <SectionBanner>{t.recordsBanner}</SectionBanner>

            <h3 style={{ fontSize: 14.5, fontWeight: 800, margin: '0 0 14px' }}>{t.education}</h3>
            {eduEntries.map((e, idx) => (
              <div
                key={idx}
                style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px dashed #e2e7ee' }}
              >
                <div className="careers-g2" style={{ marginBottom: 11 }}>
                  <input
                    style={inputStyle}
                    placeholder={t.eduMajor}
                    value={e.major ?? ''}
                    onChange={(ev) => {
                      const next = [...eduEntries];
                      next[idx] = { ...next[idx], major: ev.target.value };
                      setEduEntries(next);
                    }}
                  />
                  <select
                    data-testid={`edu-degree-${idx}`}
                    style={inputStyle}
                    aria-label={t.eduDegree}
                    value={e.degree ?? ''}
                    onChange={(ev) => {
                      const next = [...eduEntries];
                      next[idx] = { ...next[idx], degree: ev.target.value };
                      setEduEntries(next);
                    }}
                  >
                    <option value="">{t.eduDegreePick}</option>
                    {DEGREE_OPTIONS[locale].map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <input
                  style={{ ...inputStyle, marginBottom: 11 }}
                  placeholder={t.eduCourses}
                  value={e.courses ?? ''}
                  onChange={(ev) => {
                    const next = [...eduEntries];
                    next[idx] = { ...next[idx], courses: ev.target.value };
                    setEduEntries(next);
                  }}
                />
                <input
                  style={inputStyle}
                  placeholder={t.eduOther}
                  value={e.otherCourses ?? ''}
                  onChange={(ev) => {
                    const next = [...eduEntries];
                    next[idx] = { ...next[idx], otherCourses: ev.target.value };
                    setEduEntries(next);
                  }}
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() => setEduEntries([...eduEntries, { ...EMPTY_EDU }])}
              style={{
                display: 'inline-block',
                fontSize: 12.5,
                fontWeight: 700,
                color: '#fff',
                background: '#1668c4',
                padding: '10px 16px',
                borderRadius: 9,
                cursor: 'pointer',
                marginBottom: 30,
                border: 'none',
                fontFamily: 'inherit',
              }}
            >
              {t.addEducation}
            </button>

            <h3 style={{ fontSize: 14.5, fontWeight: 800, margin: '0 0 14px' }}>{t.work}</h3>
            {workEntries.map((w, idx) => (
              <div
                key={idx}
                style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px dashed #e2e7ee' }}
              >
                <div className="careers-g4" style={{ marginBottom: 11 }}>
                  <input
                    style={inputStyle}
                    placeholder={t.workCompany}
                    value={w.company ?? ''}
                    onChange={(ev) => {
                      const next = [...workEntries];
                      next[idx] = { ...next[idx], company: ev.target.value };
                      setWorkEntries(next);
                    }}
                  />
                  <input
                    style={inputStyle}
                    placeholder={t.workPosition}
                    value={w.position ?? ''}
                    onChange={(ev) => {
                      const next = [...workEntries];
                      next[idx] = { ...next[idx], position: ev.target.value };
                      setWorkEntries(next);
                    }}
                  />
                  <select
                    data-testid={`work-from-${idx}`}
                    style={inputStyle}
                    aria-label={t.workFrom}
                    value={w.fromYear ?? ''}
                    onChange={(ev) => {
                      const next = [...workEntries];
                      next[idx] = { ...next[idx], fromYear: ev.target.value };
                      setWorkEntries(next);
                    }}
                  >
                    <option value="">{t.workFrom}</option>
                    {workYearOptions(locale).map((y) => (
                      <option key={`from-${y}`} value={y}>
                        {localeDigits(y, locale)}
                      </option>
                    ))}
                  </select>
                  <select
                    data-testid={`work-to-${idx}`}
                    style={inputStyle}
                    aria-label={t.workTo}
                    value={w.toYear ?? ''}
                    onChange={(ev) => {
                      const next = [...workEntries];
                      next[idx] = { ...next[idx], toYear: ev.target.value };
                      setWorkEntries(next);
                    }}
                  >
                    <option value="">{t.workTo}</option>
                    {workYearOptions(locale).map((y) => (
                      <option key={`to-${y}`} value={y}>
                        {localeDigits(y, locale)}
                      </option>
                    ))}
                  </select>
                </div>
                <input
                  style={inputStyle}
                  placeholder={t.workReason}
                  value={w.reason ?? ''}
                  onChange={(ev) => {
                    const next = [...workEntries];
                    next[idx] = { ...next[idx], reason: ev.target.value };
                    setWorkEntries(next);
                  }}
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() => setWorkEntries([...workEntries, { ...EMPTY_WORK }])}
              style={{
                display: 'inline-block',
                fontSize: 12.5,
                fontWeight: 700,
                color: '#fff',
                background: '#1668c4',
                padding: '10px 16px',
                borderRadius: 9,
                cursor: 'pointer',
                marginBottom: 16,
                border: 'none',
                fontFamily: 'inherit',
              }}
            >
              {t.addWork}
            </button>

            <div style={{ margin: '26px 0 22px' }}>
              <SectionBanner>{t.skillsBanner}</SectionBanner>
            </div>
            <input
              style={{ ...inputStyle, marginBottom: 30 }}
              placeholder={t.skills}
              value={skills}
              onChange={(e) => setSkills(e.target.value)}
            />

            <h3 style={{ fontSize: isMobile ? 14.5 : 15.5, fontWeight: 800, margin: '0 0 16px' }}>
              {t.languages}
            </h3>
            {langEntries.map((l, idx) => (
              <div key={idx} className="careers-g2" style={{ marginBottom: 11 }}>
                <select
                  style={inputStyle}
                  value={l.lang ?? ''}
                  onChange={(ev) => {
                    const next = [...langEntries];
                    next[idx] = { ...next[idx], lang: ev.target.value };
                    setLangEntries(next);
                  }}
                >
                  <option value="">{t.langPick}</option>
                  {LANG_OPTIONS[locale].map((lo) => (
                    <option key={lo} value={lo}>
                      {lo}
                    </option>
                  ))}
                </select>
                <select
                  style={inputStyle}
                  value={l.level ?? ''}
                  onChange={(ev) => {
                    const next = [...langEntries];
                    next[idx] = { ...next[idx], level: ev.target.value };
                    setLangEntries(next);
                  }}
                >
                  <option value="">{t.levelPick}</option>
                  {LEVEL_OPTIONS[locale].map((lv) => (
                    <option key={lv} value={lv}>
                      {lv}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setLangEntries([...langEntries, { ...EMPTY_LANG }])}
              style={{
                display: 'inline-block',
                fontSize: 12.5,
                fontWeight: 700,
                color: '#fff',
                background: '#1668c4',
                padding: '10px 16px',
                borderRadius: 9,
                cursor: 'pointer',
                marginBottom: 14,
                border: 'none',
                fontFamily: 'inherit',
              }}
            >
              {t.addLanguage}
            </button>
            <input
              style={{ ...inputStyle, marginBottom: 26 }}
              placeholder={t.otherLangs}
              value={otherLangs}
              onChange={(e) => setOtherLangs(e.target.value)}
            />

            <div
              role="button"
              tabIndex={0}
              onClick={() => fileRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click();
              }}
              style={{
                border: '1.5px dashed #c7d0dc',
                borderRadius: 13,
                padding: isMobile ? '24px 14px' : '30px 20px',
                textAlign: 'center',
                cursor: 'pointer',
                marginBottom: 26,
                background: '#fff',
              }}
            >
              <div style={{ fontSize: 24, marginBottom: 8 }}>⤒</div>
              <div
                style={{
                  fontSize: 13.5,
                  fontWeight: 700,
                  color: resume ? '#1668c4' : '#16202e',
                  wordBreak: 'break-word',
                }}
              >
                {resume?.name ?? t.filePickLabel}
              </div>
              <div style={{ fontSize: 11.5, color: '#9aa4b2', marginTop: 6 }}>{t.filePickedHint}</div>
              <span
                style={{
                  display: 'inline-block',
                  marginTop: 12,
                  fontSize: 12,
                  fontWeight: 700,
                  border: '1px solid #d7dee7',
                  borderRadius: 9,
                  padding: '8px 16px',
                  color: '#3b4554',
                }}
              >
                {t.fileChoose}
              </span>
              <input
                ref={fileRef}
                data-testid="apply-resume"
                type="file"
                accept="application/pdf"
                style={{ display: 'none' }}
                onChange={(e) => onResumeChange(e.target.files?.[0] ?? null)}
              />
            </div>
            {resume ? (
              <div
                data-testid="apply-resume-selected"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  margin: '-10px 0 18px',
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid #e2e7ee',
                  background: '#f7fafc',
                  fontSize: 12.5,
                }}
              >
                <span style={{ color: '#1668c4', fontWeight: 700, wordBreak: 'break-word' }}>
                  {resume.name}
                </span>
                <button
                  type="button"
                  data-testid="apply-resume-remove"
                  onClick={() => {
                    onResumeChange(null);
                    if (fileRef.current) fileRef.current.value = '';
                  }}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: '#d64545',
                    fontWeight: 800,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    flexShrink: 0,
                  }}
                >
                  {t.fileRemove}
                </button>
              </div>
            ) : null}
            {resumeError && (
              <p style={{ margin: '-14px 0 18px', fontSize: 11.5, color: '#d64545' }}>{resumeError}</p>
            )}
            {error && <p style={{ margin: '0 0 14px', fontSize: 11.5, color: '#d64545' }}>{error}</p>}

            <button
              type="button"
              data-testid="apply-submit"
              disabled={submitting}
              onClick={() => void onSubmit()}
              style={{
                width: '100%',
                height: 52,
                borderRadius: 12,
                background: submitting ? '#aab8c8' : '#1668c4',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                fontWeight: 800,
                cursor: submitting ? 'not-allowed' : 'pointer',
                border: 'none',
                fontFamily: 'inherit',
              }}
            >
              {submitting ? t.submitting : t.submit}
            </button>
          </section>
        </>
      )}
      </div>

      {toast ? (
        <div
          style={{
            position: 'fixed',
            bottom: isMobile ? 18 : 26,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#16202e',
            color: '#fff',
            padding: '12px 20px',
            borderRadius: 11,
            fontSize: 13,
            fontWeight: 700,
            zIndex: 500,
            boxShadow: '0 14px 40px -12px rgba(0,0,0,.4)',
            maxWidth: 'min(92vw, 420px)',
            width: 'max-content',
            boxSizing: 'border-box',
            textAlign: 'center',
          }}
        >
          {toast}
        </div>
      ) : null}
    </PublicPageShell>
  );
}
