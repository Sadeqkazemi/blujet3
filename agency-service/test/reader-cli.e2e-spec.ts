import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

describe('Agency reader CLI safe failures', () => {
  it.each([
    ['missing configuration', ''],
    ['malformed configuration', 'invalid:private-reader-password'],
    [
      'unreachable database',
      'postgresql://private-reader:private-reader-password@127.0.0.1:1/blujet_test',
    ],
  ])('reports UNAVAILABLE without details for %s', (_name, url) => {
    const result = spawnSync(
      process.execPath,
      [resolve(__dirname, '../dist/verify-reader.js')],
      {
        env: { ...process.env, AGENCY_DATABASE_URL: url },
        encoding: 'utf8',
        timeout: 10000,
        windowsHide: true,
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toBe('');
    expect(result.stdout.trim()).toBe('{"status":"UNAVAILABLE"}');
  });
});
