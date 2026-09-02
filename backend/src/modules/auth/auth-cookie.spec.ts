import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('refresh cookie path compatibility', () => {
  it('sends the refresh cookie to both /auth and /api/v1/auth aliases', () => {
    const source = readFileSync(join(__dirname, 'auth.controller.ts'), 'utf8');
    const refreshCookieOptions = source.match(
      /res\.cookie\(REFRESH_COOKIE,[\s\S]*?\n\s*}\);/,
    )?.[0];
    expect(refreshCookieOptions).toContain("path: '/'");
    expect(source).toContain("res.clearCookie(REFRESH_COOKIE, { path: '/' })");
  });
});
