import type { ReactNode } from 'react';
import type { SocialLinkId } from '../../types/social-links';

const META: Record<
  SocialLinkId,
  { color: string; paths: ReactNode }
> = {
  instagram: {
    color: '#e1306c',
    paths: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="1" fill="currentColor" />
      </>
    ),
  },
  telegram: {
    color: '#229ed9',
    paths: <path d="M21 4L3 11l5 2 2 6 3-4 5 4z" />,
  },
  whatsapp: {
    color: '#25d366',
    paths: <path fill="currentColor" stroke="none" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.149-.67.149-.198.198-.767.967-.94 1.164-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.372-.025-.521-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.009-.371-.011-.57-.011-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479s1.065 2.875 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.262.489 1.693.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.981.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26C2.167 6.446 6.523 2.09 11.87 2.09c2.591 0 5.027 1.01 6.858 2.841a9.625 9.625 0 0 1 2.84 6.86c-.002 5.347-4.357 9.704-9.517 9.704m8.262-18.297A11.815 11.815 0 0 0 11.865 0C5.325 0 0 5.325 0 11.865c0 2.092.545 4.132 1.579 5.931L0 24l6.349-1.666a11.818 11.818 0 0 0 5.509 1.404h.005c6.539 0 11.864-5.325 11.867-11.865a11.82 11.82 0 0 0-3.464-8.385" />,
  },
  linkedin: {
    color: '#0a66c2',
    paths: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M7 10v7M7 7v.01M11 17v-4a2 2 0 0 1 4 0v4" />
      </>
    ),
  },
  x: {
    color: '#e7ecf3',
    paths: <path d="M4 4l16 16M20 4L4 20" />,
  },
};

export function SocialIcon({
  id,
  size = 18,
  className,
}: {
  id: SocialLinkId;
  size?: number;
  className?: string;
}) {
  const meta = META[id];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
      data-testid={`social-icon-${id}`}
    >
      {meta.paths}
    </svg>
  );
}

export function socialBrandColor(id: SocialLinkId): string {
  return META[id].color;
}
