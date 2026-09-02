import * as crypto from 'node:crypto';

/** SHA-256 hash of a refresh token — shared by auth + my-sessions. */
export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export const REFRESH_COOKIE_NAME = 'blujet_refresh';

/** Human-readable device label from User-Agent (Persian defaults). */
export function formatSessionDevice(userAgent: string | null): string {
  if (!userAgent?.trim()) return 'دستگاه ناشناس';
  const ua = userAgent.toLowerCase();
  if (ua.includes('iphone') || ua.includes('ipad')) return 'Safari · iOS';
  if (ua.includes('android')) {
    return ua.includes('blujet')
      ? 'اپلیکیشن blujet · اندروید'
      : 'Chrome · Android';
  }
  if (ua.includes('windows')) return 'Chrome · Windows';
  if (ua.includes('mac os') || ua.includes('macintosh'))
    return 'Safari · macOS';
  if (ua.includes('linux')) return 'Chrome · Linux';
  return userAgent.length > 48 ? `${userAgent.slice(0, 45)}…` : userAgent;
}
