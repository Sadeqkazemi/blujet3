import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function unique(values: string[]) {
  return [...new Set(values)];
}

describe('panel navigation route contract', () => {
  const appSource = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
  const navSource = readFileSync(
    resolve(process.cwd(), '../backend/src/modules/panels/panel-nav.config.ts'),
    'utf8',
  );

  const concreteRoutes = new Set(
    [...appSource.matchAll(/<Route\s+path=["']([^:"']+)["']/g)].map(
      (match) => match[1],
    ),
  );

  it('maps every implemented role navigation key to a concrete route', () => {
    const implementedKeys = unique(
      [
        ...navSource.matchAll(
          /\{\s*key:\s*['"]([^'"]+)['"][^}]*implemented:\s*true\s*\}/g,
        ),
      ].map((match) => match[1]),
    );

    const missing = implementedKeys.filter(
      (key) => key !== 'dashboard' && !concreteRoutes.has(key),
    );

    expect(missing).toEqual([]);
  });

  it('keeps every employee navigation destination concrete', () => {
    const employeeBlock = navSource.match(
      /export const EMPLOYEE_SECTION_NAV[\s\S]*?=\s*\{([\s\S]*?)\n\};/,
    )?.[1];
    expect(employeeBlock).toBeTruthy();

    const employeeKeys = unique(
      [...employeeBlock!.matchAll(/^\s{2}([a-z][a-z0-9]*):\s*\{/gm)].map(
        (match) => match[1],
      ),
    );
    const requiredKeys = ['referrals', ...employeeKeys];
    const missing = requiredKeys.filter((key) => !concreteRoutes.has(key));

    expect(missing).toEqual([]);
  });
});
