import { Link } from 'react-router-dom';
import { useCareersEnabled } from '../../hooks/useCareersEnabled';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useLocale, type StoredLocale } from '../../hooks/useLocale';
import { usePublicAppLinks, usePublicSupportContact } from '../../hooks/usePublicSiteSettings';
import { useSocialLinks } from '../../hooks/useSocialLinks';
import { useT } from '../../lib/i18n';
import { latinDigits } from '../../lib/fa-format';
import { SocialIcon } from './SocialIcon';

const CONTACT: Record<StoredLocale, { phone: string; email: string }> = {
  fa: { phone: 'تلفن پشتیبانی', email: 'ایمیل پشتیبانی' },
  en: { phone: 'Support phone', email: 'Support email' },
  ar: { phone: 'هاتف الدعم', email: 'البريد الإلكتروني للدعم' },
};

function BrandMark() {
  return (
    <Link to="/" className="inline-flex items-center gap-2.5 no-underline" aria-label="blujet">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#1668c4] text-white">
        <svg width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="m2.8 13.1 7.1 1.5 3.2 6.1 2-1-1.1-6 5.9-4.1c1.1-.8 1.6-2.2 1.2-3.5-.2-.7-1-1-1.6-.6l-7 4.1-5.8-4L5 6.7l3.8 5.1-5.7-.3-.3 1.6Z" fill="currentColor" />
        </svg>
      </span>
      <span className="text-[20px] font-black text-white">blujet</span>
    </Link>
  );
}

function DownloadButtons({ compact = false }: { compact?: boolean }) {
  const appLinks = usePublicAppLinks();
  const buttonClass = compact
    ? 'flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[.07] px-3 text-[11px] font-black text-white'
    : 'flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[.07] px-4 text-xs font-black text-white transition hover:bg-white/[.12]';
  return (
    <div className={`mt-5 flex flex-wrap gap-2 ${compact ? 'justify-center' : 'justify-start'}`} dir="ltr">
      <a data-testid="footer-app-store" className={buttonClass} href={appLinks.app_store || '#'} aria-label="App Store">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M17.05 12.5c-.03-2.36 1.93-3.5 2.02-3.55-1.1-1.6-2.8-1.82-3.4-1.85-1.44-.15-2.83.85-3.56.85-.74 0-1.87-.83-3.08-.8-1.58.02-3.05.92-3.86 2.34-1.66 2.88-.42 7.13 1.2 9.46.79 1.13 1.72 2.4 2.95 2.36 1.18-.05 1.63-.76 3.06-.76 1.42 0 1.83.76 3.08.73 1.28-.02 2.08-1.15 2.86-2.29.9-1.3 1.27-2.57 1.29-2.64-.03-.01-2.47-.95-2.5-3.76M14.65 4.87c.66-.8 1.1-1.9.98-3.02-.95.04-2.1.63-2.78 1.43-.61.7-1.15 1.85-1 2.93 1.06.08 2.14-.53 2.8-1.34" />
        </svg>
        App Store
      </a>
      <a data-testid="footer-google-play" className={buttonClass} href={appLinks.google_play || '#'} aria-label="Google Play">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M3.6 2.3c-.35.2-.6.6-.6 1.1v17.2c0 .5.25.9.6 1.1l9.6-9.7L3.6 2.3zm12.5 8.7 2.5-1.4c.7-.4.7-1.4 0-1.8l-2.6-1.5-2.7 2.8 2.8 2.9zm-2.9-2 2.7-2.8L5.1 1.7l8.1 7.3zm0 2.1-8.1 8.2 10.9-6.3-2.8-1.9z" />
        </svg>
        Google Play
      </a>
    </div>
  );
}

function ContactRows({ compact = false }: { compact?: boolean }) {
  const { locale } = useLocale();
  const contact = usePublicSupportContact();
  const labels = CONTACT[locale];
  const rowClass = compact ? 'justify-center' : 'justify-start';
  // Support contact values are persisted in the locale-independent settings
  // API and may contain Persian/Arabic numerals. Keep the Persian UI's
  // configured representation, while normalizing English display and the
  // tel: target to Latin digits so the footer never leaks a second numeral
  // representation into an English page.
  const displayPhone = locale === 'en' ? latinDigits(contact.phone) : contact.phone;
  const phoneHref = `tel:${latinDigits(contact.phone).replace(/[^+\d]/g, '')}`;
  return (
    <div className={`mt-5 flex flex-col gap-3 ${compact ? 'items-center' : 'items-start'}`}>
      <a href={phoneHref} aria-label={labels.phone} className={`flex items-center gap-3 text-[#f3f7fb] no-underline ${rowClass}`}>
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[.07] text-white">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.8a2 2 0 0 1-.5 2.1L8.1 9.8a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.8 2.1Z" />
          </svg>
        </span>
        <span dir="ltr" className="font-num text-sm font-bold">{displayPhone}</span>
      </a>
      <a href={`mailto:${contact.email}`} aria-label={labels.email} className={`flex items-center gap-3 text-[#f3f7fb] no-underline ${rowClass}`}>
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[.07] text-white">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m3 7 9 6 9-6" />
          </svg>
        </span>
        <span dir="ltr" className="text-sm font-bold">{contact.email}</span>
      </a>
    </div>
  );
}

function SocialLinks({ compact = false }: { compact?: boolean }) {
  const links = useSocialLinks();
  if (!links.length) return null;
  return (
    <div className="footer-social-section mt-5" data-testid="footer-social-section">
      <div className={`flex flex-wrap items-center gap-2 ${compact ? 'justify-center' : 'justify-start'}`} data-testid="footer-social-links">
        {links.map((link) => (
          <a
            key={link.id}
            href={link.url}
            target="_blank"
            rel="noreferrer noopener"
            aria-label={link.name}
            title={link.name}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[.07] text-[#d9e4ef] transition hover:-translate-y-0.5 hover:bg-white/[.13] hover:text-white"
            data-testid={`footer-social-${link.id}`}
          >
            <SocialIcon id={link.id} size={18} />
          </a>
        ))}
      </div>
    </div>
  );
}

function TrustBadges({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const badges = [t('badgeTrust'), t('badgeGuild'), t('badgeSamandehi'), t('badgeIata')];
  return (
    <div className="footer-trust-section" data-testid="footer-trust-section">
      <div className={`flex flex-wrap items-center gap-3 ${compact ? 'justify-center' : 'justify-start'}`} data-testid="footer-trust-badges">
        {badges.map((label) => (
          <span key={label} className="flex h-[66px] w-[78px] items-center justify-center rounded-xl border border-white/10 bg-white/[.055] px-2 text-center text-[9px] leading-[1.45] text-[#a9bbcf]">
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function FooterLinkColumn({ title, links }: { title: string; links: { to: string; label: string }[] }) {
  return (
    <div className="min-w-0">
      <h3 className="mb-5 text-[15px] font-black text-white">{title}</h3>
      <div className="flex flex-col gap-3.5 text-[13px]">
        {links.map((link) => (
          <Link key={link.label} to={link.to} className="text-[#b6c7d9] no-underline transition hover:text-white">
            {link.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function MobileAccordionSection({ title, links }: { title: string; links: { to: string; label: string }[] }) {
  return (
    <details className="border-b border-white/10">
      <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-sm font-black text-white">
        {title}
        <svg className="footer-chevron text-[#8fa4ba] transition" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div className="flex flex-col items-start gap-3 px-5 pb-5 text-[13px]">
        {links.map((link) => (
          <Link key={link.label} to={link.to} className="text-[#b6c7d9] no-underline">
            {link.label}
          </Link>
        ))}
      </div>
    </details>
  );
}

export default function PublicFooter() {
  const t = useT();
  const { locale } = useLocale();
  const isMobile = useIsMobile();
  const careersEnabled = useCareersEnabled();

  const serviceLinks = [
    { to: '/manage-booking', label: t('footerManageBooking') },
    { to: '/flight-status', label: t('footerFlightStatus') },
    { to: '/club', label: t('navLoyalty') },
    ...(careersEnabled ? [{ to: '/careers', label: t('footerCareers') }] : []),
  ];
  const companyLinks = [
    { to: '/about', label: t('footerAbout') },
    { to: '/contact', label: t('footerContact') },
    { to: '/travel-info', label: t('footerTerms') },
  ];
  const supportLinks = [
    { to: '/support', label: t('footerHelpCenter') },
    { to: '/support', label: t('footerFaq') },
  ];

  return (
    <footer className="mt-12 bg-[#0d2943] text-[#b6c7d9] md:mt-[72px]">
      <style>{`
        footer summary::-webkit-details-marker { display: none; }
        footer details[open] .footer-chevron { transform: rotate(180deg); }
      `}</style>

      {!isMobile ? (
        <>
          <div data-testid="public-footer-desktop" className="mx-auto grid max-w-[1480px] grid-cols-[minmax(300px,1.25fr)_repeat(3,minmax(150px,.8fr))] items-start gap-[clamp(36px,5vw,92px)] px-10 pb-5 pt-9">
            <div className="min-w-0">
              <BrandMark />
              <p className="mb-0 mt-5 max-w-[330px] text-[13.5px] leading-8 text-[#c2d0df]">{t('footerTagline')}</p>
              <ContactRows />
              <SocialLinks />
            </div>
            <FooterLinkColumn title={t('footerColServices')} links={serviceLinks} />
            <FooterLinkColumn title={t('footerColCompany')} links={companyLinks} />
            <FooterLinkColumn title={t('footerColSupport')} links={supportLinks} />
          </div>
          <div
            data-testid="footer-desktop-tools"
            className={`mx-auto flex max-w-[1480px] flex-col px-10 pb-5 ${locale === 'en' ? 'items-end' : 'items-start'}`}
            dir="ltr"
          >
            <DownloadButtons />
            <div data-testid="footer-desktop-trust-row" className={`mt-3 flex ${locale === 'en' ? 'justify-end' : 'justify-start'}`} dir="ltr">
              <TrustBadges />
            </div>
          </div>
          <div className="border-t border-white/[.07]">
            <div className="mx-auto max-w-[1480px] px-10 py-3 text-[11.5px] text-[#7f96ae]">{t('footerCopyright')}</div>
          </div>
        </>
      ) : (
        <>
          <div className="px-5 pb-5 pt-7 text-center">
            <BrandMark />
            <p className="mx-auto mb-0 mt-4 max-w-[300px] text-[13px] leading-7 text-[#c2d0df]">{t('footerTagline')}</p>
            <DownloadButtons compact />
            <ContactRows compact />
            <SocialLinks compact />
            <div className="mt-5"><TrustBadges compact /></div>
          </div>
          <div className="border-t border-white/10">
            <MobileAccordionSection title={t('footerColServices')} links={serviceLinks} />
            <MobileAccordionSection title={t('footerColCompany')} links={companyLinks} />
            <MobileAccordionSection title={t('footerColSupport')} links={supportLinks} />
          </div>
          <div className="px-5 py-3 text-center text-[11px] text-[#7f96ae]">{t('footerCopyright')}</div>
        </>
      )}
    </footer>
  );
}
