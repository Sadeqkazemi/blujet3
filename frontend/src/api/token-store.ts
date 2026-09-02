/**
 * Access token lives in memory only — never localStorage (XSS-exposed).
 * The refresh token is an httpOnly cookie the browser sends automatically;
 * losing the in-memory token on reload is recovered via POST /auth/refresh.
 */
let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}
